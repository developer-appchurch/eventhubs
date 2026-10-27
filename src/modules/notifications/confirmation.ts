import "server-only";
import QRCode from "qrcode";
import { formatCents, formatDate } from "@/lib/datetime";
import { getEmailEnv, getEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkinUrl } from "@/modules/checkins/code";
import { FORMAT_LABELS, type EventFormat } from "@/modules/events/status";
import { sendEmail } from "./resend";

type Context = {
  notification_id: string;
  attendee_name: string;
  attendee_email: string;
  public_token: string;
  checkin_code: string;
  price_cents: number;
  ticket: string;
  organization: { name: string; slug: string };
  event: {
    id: string;
    slug: string;
    title: string;
    format: EventFormat;
    venue_name: string;
    address: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    online_url: string | null;
    contact_email: string | null;
  };
};

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

// E-mail de inscrição confirmada com o QR Code do check-in, uma vez por inscrição. Nunca lança:
// falha de envio fica registrada em notifications e a inscrição continua válida.
export async function sendConfirmationEmail(by: { registrationId?: string; token?: string }): Promise<void> {
  const env = getEmailEnv();
  if (!env) return;
  const admin = createSupabaseAdminClient(env.SUPABASE_SECRET_KEY);
  try {
    const { data, error } = await admin.rpc("claim_confirmation_email", { p_registration_id: by.registrationId ?? null, p_token: by.token ?? null });
    if (error) throw error;
    if (!data) return;
    const ctx = data as Context;
    let messageId: string | null = null;
    let failure: string | null = null;
    try {
      messageId = await sendEmail(env, await buildEmail(ctx));
    } catch (e) {
      failure = e instanceof Error ? e.message : "falha no envio";
    }
    await admin.rpc("finish_confirmation_email", { p_notification_id: ctx.notification_id, p_message_id: messageId, p_error: failure });
    if (failure) console.error("[e-mail] confirmação não enviada", { notification: ctx.notification_id, failure });
  } catch (e) {
    console.error("[e-mail] falha ao preparar confirmação", { error: e instanceof Error ? e.message : "erro" });
  }
}

export async function buildEmail(ctx: Context) {
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  const { event } = ctx;
  const statusUrl = `${appUrl}/${ctx.organization.slug}/${event.slug}/inscricao/${ctx.public_token}`;
  const qr = await QRCode.toBuffer(checkinUrl(appUrl, ctx.organization.slug, event.id, ctx.checkin_code), { type: "png", width: 320, margin: 1 });
  const when = `${formatDate(event.starts_at, event.timezone)} até ${formatDate(event.ends_at, event.timezone)}`;
  const where = event.format === "online" ? FORMAT_LABELS.online : [event.venue_name, event.address].filter(Boolean).join(" · ");
  const rows: [string, string][] = [
    ["Participante", ctx.attendee_name],
    ["Ingresso", `${ctx.ticket}${ctx.price_cents ? ` · ${formatCents(ctx.price_cents)}` : ""}`],
    ["Quando", when],
    ["Onde", where],
    ...(event.format !== "in_person" && event.online_url ? ([["Acesso online", event.online_url]] as [string, string][]) : []),
    ...(event.contact_email ? ([["Contato do organizador", event.contact_email]] as [string, string][]) : []),
  ];

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:14px;color:#52606d">${escape(ctx.organization.name)}</p>
<h1 style="margin:0 0 16px;font-size:22px">Inscrição confirmada: ${escape(event.title)}</h1>
<p style="margin:0 0 20px;font-size:15px">Olá, ${escape(ctx.attendee_name)}. Sua inscrição está confirmada. Apresente o QR Code abaixo na entrada do evento.</p>
<p style="margin:0 0 8px;text-align:center"><img src="cid:qr-checkin" width="220" height="220" alt="QR Code do check-in" style="display:inline-block"></p>
<p style="margin:0 0 24px;text-align:center;font-size:12px;color:#52606d">Código: <span style="font-family:monospace">${ctx.checkin_code}</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#52606d;width:40%;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;font-weight:bold">${escape(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:24px 0 0"><a href="${escape(statusUrl)}" style="display:inline-block;background:#2f54eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">Ver minha inscrição</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#7b8794">Este link é pessoal: não compartilhe. Se perder este e-mail, o QR Code também aparece na página da inscrição.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Inscrição confirmada: ${event.title}`,
    "",
    `Olá, ${ctx.attendee_name}. Sua inscrição está confirmada. Apresente o QR Code (anexo) na entrada do evento.`,
    `Código do check-in: ${ctx.checkin_code}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Ver minha inscrição: ${statusUrl}`,
  ].join("\n");

  return {
    to: ctx.attendee_email,
    subject: `Inscrição confirmada: ${event.title}`,
    html,
    text,
    idempotencyKey: `confirmacao-${ctx.notification_id}`,
    inlineImage: { filename: "qrcode.png", contentId: "qr-checkin", content: qr.toString("base64") },
  };
}
