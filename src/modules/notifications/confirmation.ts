import "server-only";
import QRCode from "qrcode";
import { formatCents, formatDate, formatDateTime } from "@/lib/datetime";
import { getEmailEnv, getEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkinUrl } from "@/modules/checkins/code";
import { FORMAT_LABELS, type EventFormat } from "@/modules/events/status";
import { getRegistrationByToken, type PublicRegistration } from "@/modules/registrations/queries";
import { sendEmail } from "./resend";

export type Context = {
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

// Link da inscrição pendente, para quem fechar a página voltar e pagar. Nunca lança.
// Sem registro em notifications: sai uma vez na criação, e a chave de idempotência do
// provedor segura um reenvio da mesma requisição.
export async function sendPendingPaymentEmail(token: string): Promise<void> {
  const env = getEmailEnv();
  if (!env) return;
  try {
    const registration = await getRegistrationByToken(token);
    if (registration?.status !== "pending_payment" || !registration.expires_at) return;
    await sendEmail(env, buildPendingEmail(registration, token));
  } catch (e) {
    console.error("[e-mail] pagamento pendente não enviado", { error: e instanceof Error ? e.message : "erro" });
  }
}

export function buildPendingEmail(registration: PublicRegistration, token: string) {
  const { event } = registration;
  const statusUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/${registration.organization.slug}/${event.slug}/inscricao/${token}`;
  const until = formatDateTime(registration.expires_at as string, event.timezone);
  const subject = `Finalize o pagamento: ${event.title}`;
  const intro = `Olá, ${registration.attendee_name}. Sua vaga no ingresso ${registration.ticket.name} está reservada até ${until}. Pague ${formatCents(registration.total_cents)} para confirmar a inscrição.`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:14px;color:#52606d">${escape(registration.organization.name)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escape(subject)}</h1>
<p style="margin:0 0 20px;font-size:15px">${escape(intro)}</p>
<p style="margin:0 0 20px"><a href="${escape(statusUrl)}" style="display:inline-block;background:#2f54eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">Continuar o pagamento</a></p>
<p style="margin:0;font-size:12px;color:#7b8794">Se você já pagou, ignore este e-mail: a confirmação com o QR Code chega assim que o Mercado Pago aprovar. Este link é pessoal: não compartilhe.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [subject, "", intro, "", `Continuar o pagamento: ${statusUrl}`, "", "Se você já pagou, ignore este e-mail."].join("\n");
  return { to: registration.attendee_email, subject, html, text, idempotencyKey: `pendente-${token.slice(0, 32)}` };
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
