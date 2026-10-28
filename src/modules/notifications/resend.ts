import "server-only";
import type { EmailEnv } from "@/lib/env";

// Único ponto que conhece o provedor de e-mail. Trocar de provedor = reescrever esta função.
export async function sendEmail(
  env: EmailEnv,
  email: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
    inlineImage?: { filename: string; contentId: string; content: string };
  },
): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": email.idempotencyKey },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject.slice(0, 200),
      html: email.html,
      text: email.text,
      attachments: email.inlineImage
        ? [{ filename: email.inlineImage.filename, content: email.inlineImage.content, content_id: email.inlineImage.contentId, content_type: "image/png" }]
        : undefined,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  // Só o código HTTP vai para o registro: a resposta pode repetir o e-mail do destinatário.
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  const data = (await response.json()) as { id?: string };
  return String(data.id ?? "");
}
