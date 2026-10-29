import "server-only";
import { formatDate } from "@/lib/datetime";
import { getEmailEnv, getEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FORMAT_LABELS } from "@/modules/events/status";
import type { Context } from "./confirmation";
import { sendEmail } from "./resend";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function buildReminderEmail(ctx: Context) {
  const { event } = ctx;
  const statusUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/${ctx.organization.slug}/${event.slug}/inscricao/${ctx.public_token}`;
  const where = event.format === "online" ? FORMAT_LABELS.online : [event.venue_name, event.address].filter(Boolean).join(" · ");
  const subject = `Lembrete: ${event.title} começa em breve`;
  const intro = `Olá, ${ctx.attendee_name}. O evento começa em ${formatDate(event.starts_at, event.timezone)}. Tenha o QR Code da sua inscrição à mão na entrada.`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px"><tr><td>
<p style="margin:0 0 4px;font-size:14px;color:#52606d">${escape(ctx.organization.name)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escape(subject)}</h1>
<p style="margin:0 0 12px;font-size:15px">${escape(intro)}</p>
${where ? `<p style="margin:0 0 12px;font-size:15px"><strong>Onde:</strong> ${escape(where)}</p>` : ""}
${event.format !== "in_person" && event.online_url ? `<p style="margin:0 0 12px;font-size:15px"><strong>Acesso online:</strong> ${escape(event.online_url)}</p>` : ""}
<p style="margin:24px 0 0"><a href="${escape(statusUrl)}" style="display:inline-block;background:#2f54eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">Ver minha inscrição e o QR Code</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#7b8794">Este link é pessoal: não compartilhe.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [subject, "", intro, where ? `Onde: ${where}` : "", "", `Ver minha inscrição e o QR Code: ${statusUrl}`].filter((l, i, a) => l || a[i - 1]).join("\n");
  return { to: ctx.attendee_email, subject, html, text, idempotencyKey: `lembrete-${ctx.notification_id}` };
}

// Envia os lembretes pendentes (eventos que começam em até 24h). Chamado pelo cron diário.
// Falha de um envio não derruba os outros: fica em notifications e é retentada na próxima rodada.
export async function sendEventReminders(limit = 100): Promise<{ sent: number; failed: number } | null> {
  const env = getEmailEnv();
  if (!env) return null;
  const admin = createSupabaseAdminClient(env.SUPABASE_SECRET_KEY);
  const { data, error } = await admin.rpc("claim_event_reminders", { p_limit: limit });
  if (error) throw new Error("Não foi possível reservar os lembretes.");
  let sent = 0;
  let failed = 0;
  for (const ctx of (data ?? []) as Context[]) {
    let messageId: string | null = null;
    let failure: string | null = null;
    try {
      messageId = await sendEmail(env, buildReminderEmail(ctx));
    } catch (e) {
      failure = e instanceof Error ? e.message : "falha no envio";
    }
    await admin.rpc("finish_confirmation_email", { p_notification_id: ctx.notification_id, p_message_id: messageId, p_error: failure });
    if (failure) {
      failed++;
      console.error("[e-mail] lembrete não enviado", { notification: ctx.notification_id, failure });
    } else sent++;
  }
  return { sent, failed };
}
