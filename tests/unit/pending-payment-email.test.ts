import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_0123456789abcdef");

const { buildPendingEmail } = await import("../../src/modules/notifications/confirmation");

const token = "a".repeat(64);
const registration = {
  status: "pending_payment" as const,
  attendee_name: 'Ana <script>alert("x")</script>',
  attendee_email: "ana@exemplo.com",
  created_at: "2026-11-01T12:00:00Z",
  price_cents: 5000,
  pays_here: true,
  total_cents: 5000,
  group_names: [] as string[],
  expires_at: "2026-11-01T12:30:00Z",
  checkin_code: null,
  ticket: { name: "Lote 1" },
  organization: { name: "Igreja & Cia", slug: "igreja" },
  event: {
    id: "ev-1", slug: "congresso", title: "Congresso", status: "published" as const, format: "in_person" as const, venue_name: "Auditório",
    address: "Rua A, 1", starts_at: "2026-11-20T22:00:00Z", ends_at: "2026-11-21T01:00:00Z", timezone: "America/Sao_Paulo",
    contact_email: null, contact_phone: null, online_url: null,
  },
};

describe("e-mail de pagamento pendente", () => {
  it("leva o link para continuar o pagamento, o prazo e escapa o que veio do usuário", () => {
    const email = buildPendingEmail(registration, token);
    expect(email.to).toBe("ana@exemplo.com");
    expect(email.subject).toBe("Finalize o pagamento: Congresso");
    expect(email.html).toContain(`https://app.example.test/igreja/congresso/inscricao/${token}`);
    expect(email.text).toContain(`Continuar o pagamento: https://app.example.test/igreja/congresso/inscricao/${token}`);
    expect(email.html).toContain("09:30");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Igreja &amp; Cia");
  });
});
