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
