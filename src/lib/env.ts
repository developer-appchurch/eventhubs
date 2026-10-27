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

// E-mail transacional é opcional: sem esta configuração, nada é enviado e nada finge ter sido.
const emailSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  RESEND_API_KEY: z.string().startsWith("re_"),
  // Remetente num domínio verificado no Resend, por exemplo "EventHubs <inscricoes@seudominio.com.br>".
  EMAIL_FROM: z.string().min(3),
});

export type EmailEnv = z.infer<typeof emailSchema>;

export function getEmailEnv(): EmailEnv | null {
  const parsed = emailSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  });
  return parsed.success ? parsed.data : null;
}

// Pagamentos são opcionais: sem esta configuração completa, ingressos pagos ficam
// indisponíveis e a tela de configurações diz o que falta, sem fingir conexão.
const paymentSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  MERCADOPAGO_CLIENT_ID: z.string().regex(/^\d{1,20}$/),
  MERCADOPAGO_CLIENT_SECRET: z.string().min(10),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(10),
  // 32 bytes em base64 (openssl rand -base64 32): cifra os tokens das organizações no banco.
  PAYMENT_TOKEN_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "32 bytes em base64"),
  // Taxa do EventHubs em pontos-base (500 = 5%), retida pelo Mercado Pago em cada pagamento.
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(0),
});

export type PaymentEnv = z.infer<typeof paymentSchema>;

export function getPaymentEnv(): PaymentEnv | null {
  const parsed = paymentSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    MERCADOPAGO_CLIENT_ID: process.env.MERCADOPAGO_CLIENT_ID,
    MERCADOPAGO_CLIENT_SECRET: process.env.MERCADOPAGO_CLIENT_SECRET,
    MERCADOPAGO_WEBHOOK_SECRET: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    PAYMENT_TOKEN_KEY: process.env.PAYMENT_TOKEN_KEY,
    PLATFORM_FEE_BPS: process.env.PLATFORM_FEE_BPS || undefined,
  });
  if (parsed.success) return parsed.data;
  // Só os nomes das variáveis inválidas, nunca os valores: sem isso o botão do Mercado Pago some sem pista.
  console.warn(`Pagamentos desativados; variáveis inválidas: ${[...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ")}`);
  return null;
}
