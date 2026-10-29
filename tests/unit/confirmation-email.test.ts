import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");

const { buildEmail } = await import("../../src/modules/notifications/confirmation");
const { sendEmail } = await import("../../src/modules/notifications/resend");

const code = "0123456789abcdef0123456789abcdef";
const ctx = {
  notification_id: "n-1",
  attendee_name: 'Ana <script>alert("x")</script>',
  attendee_email: "ana@exemplo.com",
  public_token: "f".repeat(64),
  checkin_code: code,
  price_cents: 0,
  ticket: "Gratuito",
  organization: { name: "Igreja & Cia", slug: "igreja" },
  event: {
    id: "ev-1", slug: "congresso", title: "Congresso", format: "in_person" as const, venue_name: "Auditório", address: "Rua A, 1",
    starts_at: "2026-11-20T22:00:00Z", ends_at: "2026-11-21T01:00:00Z", timezone: "America/Sao_Paulo", online_url: null, contact_email: null,
  },
};

describe("e-mail de confirmação", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leva QR inline, código, link da inscrição e escapa o que veio do usuário", async () => {
    const email = await buildEmail(ctx);
    expect(email.to).toBe("ana@exemplo.com");
    expect(email.html).toContain('src="cid:qr-checkin"');
    expect(email.html).toContain(code);
    expect(email.html).toContain(`https://app.example.test/igreja/congresso/inscricao/${"f".repeat(64)}`);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Igreja &amp; Cia");
    expect(email.text).toContain("Código do check-in: " + code);
    expect(Buffer.from(email.inlineImage.content, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("envia ao Resend com imagem inline e idempotência; erro não vaza a resposta", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { SUPABASE_SECRET_KEY: "sb_secret_x", RESEND_API_KEY: "re_123", EMAIL_FROM: "EventHub <ola@ex.com>" };
    const email = await buildEmail(ctx);
    await expect(sendEmail(env, email)).resolves.toBe("email-1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("confirmacao-n-1");
    expect(JSON.parse(String(init.body)).attachments[0]).toMatchObject({ content_id: "qr-checkin", content_type: "image/png" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"ana@exemplo.com inválido"}', { status: 422 })));
    await expect(sendEmail(env, email)).rejects.toThrow(/^Resend HTTP 422$/);
  });
});
