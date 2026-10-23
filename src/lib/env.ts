import "server-only";
import { z } from "zod";

// Nomes das variáveis são lidos literalmente para que o Next.js consiga embutir os
// NEXT_PUBLIC_* no bundle do navegador.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type Env = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(readonly missing: string[]) {
    // Mensagem contém somente nomes de variáveis, nunca valores.
    super(`Configuração ausente ou inválida: ${missing.join(", ")}`);
    this.name = "ConfigError";
  }
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const missing = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(missing);
  }

  cached = parsed.data;
  return cached;
}
