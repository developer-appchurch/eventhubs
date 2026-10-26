import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const VARS = {
  NEXT_PUBLIC_APP_URL: "https://app.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
};

describe("getEnv", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of Object.keys(VARS)) vi.stubEnv(key, "");
    vi.unstubAllEnvs();
  });

  it("aceita configuração completa", async () => {
    for (const [key, value] of Object.entries(VARS)) vi.stubEnv(key, value);
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(VARS.NEXT_PUBLIC_SUPABASE_URL);
  });

  it("informa somente os nomes das variáveis ausentes, sem valores", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { getEnv, ConfigError } = await import("@/lib/env");
    try {
      getEnv();
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(message).not.toContain("app.example.test");
    }
  });

  it("recusa URL com protocolo fora de http/https", async () => {
    for (const [key, value] of Object.entries(VARS)) vi.stubEnv(key, value);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "ftp://abc.supabase.co");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("getPaymentEnv", () => {
  const PAY = {
    SUPABASE_SECRET_KEY: "sb_secret_0123456789abcdef",
    MERCADOPAGO_CLIENT_ID: "1234567890",
    MERCADOPAGO_CLIENT_SECRET: "segredo-do-app",
    MERCADOPAGO_WEBHOOK_SECRET: "segredo-do-webhook",
    PAYMENT_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"),
  };
  afterEach(() => vi.unstubAllEnvs());

  it("sem configuração completa, pagamentos ficam desligados", async () => {
    const { getPaymentEnv } = await import("@/lib/env");
    for (const [key, value] of Object.entries(PAY)) vi.stubEnv(key, value);
    expect(getPaymentEnv()).toMatchObject({ PLATFORM_FEE_BPS: 0 });
    vi.stubEnv("PLATFORM_FEE_BPS", "500");
    expect(getPaymentEnv()?.PLATFORM_FEE_BPS).toBe(500);
    vi.stubEnv("PAYMENT_TOKEN_KEY", "curta");
    expect(getPaymentEnv()).toBeNull();
    vi.stubEnv("PAYMENT_TOKEN_KEY", PAY.PAYMENT_TOKEN_KEY);
    vi.stubEnv("PLATFORM_FEE_BPS", "9000");
    expect(getPaymentEnv()).toBeNull();
  });
});
