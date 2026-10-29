import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");

const { buildReminderEmail } = await import("../../src/modules/notifications/reminder");

const ctx = {
  notification_id: "n-1",
  attendee_name: 'Ana <script>alert("x")</script>',
  attendee_email: "ana@exemplo.com",
  public_token: "a".repeat(64),
  checkin_code: "ABC123",
  price_cents: 0,
  ticket: "Geral",
  organization: { name: "Igreja & Cia", slug: "igreja" },
  event: {
    id: "ev-1", slug: "congresso", title: "Congresso", format: "in_person" as const, venue_name: "Auditório", address: "Rua A, 1",
    starts_at: "2026-11-20T03:00:00Z", ends_at: "2026-11-21T02:59:00Z", timezone: "America/Sao_Paulo", online_url: null, contact_email: null,
  },
};

describe("e-mail de lembrete", () => {
  it("leva o link da inscrição, o local, a chave de idempotência e escapa o que veio do usuário", () => {
    const email = buildReminderEmail(ctx);
    expect(email.to).toBe("ana@exemplo.com");
    expect(email.idempotencyKey).toBe("lembrete-n-1");
    expect(email.text).toContain("https://app.example.test/igreja/congresso/inscricao/" + "a".repeat(64));
    expect(email.text).toContain("Auditório · Rua A, 1");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Igreja &amp; Cia");
  });
});
