import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Integração com o Mercado Pago (modelo marketplace). É a única parte do código que conhece o
// provedor: o resto do sistema fala em checkout, pagamento e estado normalizado. Outro gateway
// entraria como outro módulo com estas mesmas funções.

const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;

export const PAYMENT_STATUSES = [
  "pending", "in_process", "authorized", "approved", "rejected", "cancelled", "refunded", "charged_back", "in_mediation",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export class PaymentProviderError extends Error {
  constructor(readonly operation: string, readonly status?: number) {
    // Nunca inclui corpo da resposta nem tokens: só a operação e o código HTTP.
    super(`Mercado Pago: falha em ${operation}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "PaymentProviderError";
  }
}

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  publicKey: string;
  userId: string;
  expiresAt: Date;
  liveMode: boolean;
};

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    platform_id: "mp",
    state: input.state,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://auth.mercadopago.com/authorization?${params}`;
}

async function call(operation: string, path: string, init: RequestInit & { token?: string }): Promise<Record<string, unknown>> {
  const { token, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new PaymentProviderError(operation);
  }
  if (!response.ok) throw new PaymentProviderError(operation, response.status);
  return (await response.json()) as Record<string, unknown>;
}

function tokensFrom(data: Record<string, unknown>): OAuthTokens {
  const { access_token, refresh_token, public_key, user_id, expires_in, live_mode } = data;
  if (typeof access_token !== "string" || typeof refresh_token !== "string" || typeof public_key !== "string" || user_id == null) {
    throw new PaymentProviderError("oauth (resposta incompleta)");
  }
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    publicKey: public_key,
    userId: String(user_id),
    // Documentado como 180 dias; usa o expires_in devolvido quando houver.
    expiresAt: new Date(Date.now() + (Number(expires_in) || 180 * 86_400) * 1000),
    liveMode: live_mode === true,
  };
}

export async function exchangeCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string }) {
  const data = await call("oauth", "/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  });
  return tokensFrom(data);
}

export async function refreshTokens(input: { clientId: string; clientSecret: string; refreshToken: string }) {
  const data = await call("oauth refresh", "/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
  });
  return tokensFrom(data);
}

export type CheckoutInput = {
  registrationId: string;
  title: string;
  priceCents: number;
  platformFeeCents: number;
  payer: { name: string; email: string };
  expiresAt: Date;
  notificationUrl: string;
  returnUrl: string;
  organization: { id: string; name: string };
};

// Checkout Pro criado com o token do vendedor (a organização). marketplace_fee é a parte do
// EventHubs, em reais. Boleto fica de fora: compensa em dias e a reserva dura 30 minutos.
export async function createCheckout(sellerToken: string, input: CheckoutInput): Promise<{ id: string; url: string }> {
  const data = await call("checkout", "/checkout/preferences", {
    method: "POST",
    token: sellerToken,
    headers: { "X-Idempotency-Key": input.registrationId },
    body: JSON.stringify({
      items: [{ id: input.registrationId, title: input.title.slice(0, 250), quantity: 1, unit_price: input.priceCents / 100, currency_id: "BRL" }],
      payer: { name: input.payer.name, email: input.payer.email },
      external_reference: input.registrationId,
      // Várias organizações podem usar a mesma conta: a tesouraria identifica a origem por aqui.
      metadata: { organization_id: input.organization.id, organization_name: input.organization.name },
      notification_url: input.notificationUrl,
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      auto_return: "approved",
      marketplace_fee: input.platformFeeCents / 100,
      payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
      expires: true,
      expiration_date_to: input.expiresAt.toISOString(),
      date_of_expiration: input.expiresAt.toISOString(),
      statement_descriptor: "EVENTHUBS",
    }),
  });
  if (typeof data.id !== "string" || typeof data.init_point !== "string" || !data.init_point.startsWith("https://")) {
    throw new PaymentProviderError("checkout (resposta incompleta)");
  }
  return { id: data.id, url: data.init_point };
}

// O Pix vence no mínimo 30 minutos depois de criado (regra do Mercado Pago). Prazo fixo a partir da
// reserva para a mesma chave de idempotência sempre mandar o mesmo corpo; pagamento depois da
// reserva cai na regra de reserva vencida do record_payment.
const PIX_GRACE_MS = 31 * 60_000;

export type PixInput = Omit<CheckoutInput, "returnUrl">;

// Pix criado direto na API de pagamentos, com o token do vendedor. A chave de idempotência por
// inscrição faz o Mercado Pago devolver o mesmo Pix enquanto ele vale, sem guardar nada aqui.
export async function createPix(sellerToken: string, input: PixInput): Promise<{ id: string; code: string }> {
  const data = await call("pix", "/v1/payments", {
    method: "POST",
    token: sellerToken,
    headers: { "X-Idempotency-Key": `pix-${input.registrationId}` },
    body: JSON.stringify({
      transaction_amount: input.priceCents / 100,
      description: input.title.slice(0, 250),
      payment_method_id: "pix",
      payer: { email: input.payer.email, first_name: input.payer.name.slice(0, 100) },
      external_reference: input.registrationId,
      metadata: { organization_id: input.organization.id, organization_name: input.organization.name },
      notification_url: input.notificationUrl,
      application_fee: input.platformFeeCents / 100,
      date_of_expiration: new Date(input.expiresAt.getTime() + PIX_GRACE_MS).toISOString(),
      statement_descriptor: "EVENTHUBS",
    }),
  });
  const code = (data.point_of_interaction as { transaction_data?: { qr_code?: unknown } } | undefined)?.transaction_data?.qr_code;
  if (data.id == null || typeof code !== "string" || !code) throw new PaymentProviderError("pix (resposta incompleta)");
  return { id: String(data.id), code };
}

export type ProviderPayment = {
  id: string;
  status: PaymentStatus;
  statusDetail: string;
  externalReference: string;
  amountCents: number;
  currency: string;
  collectorId: string;
};

export async function getPayment(sellerToken: string, paymentId: string): Promise<ProviderPayment> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new PaymentProviderError("consulta (id inválido)");
  const data = await call("consulta", `/v1/payments/${paymentId}`, { method: "GET", token: sellerToken });
  const status = String(data.status) as PaymentStatus;
  if (!PAYMENT_STATUSES.includes(status)) throw new PaymentProviderError(`consulta (status ${status})`);
  return {
    id: String(data.id),
    status,
    statusDetail: String(data.status_detail ?? ""),
    externalReference: String(data.external_reference ?? ""),
    amountCents: toCents(Number(data.transaction_amount)),
    currency: String(data.currency_id ?? ""),
    collectorId: String(data.collector_id ?? (data.collector as { id?: unknown } | undefined)?.id ?? ""),
  };
}

export function toCents(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : -1;
}

// Taxa arredondada para baixo: nunca cobra mais que o percentual configurado.
export function platformFeeCents(priceCents: number, feeBps: number): number {
  return Math.floor((priceCents * feeBps) / 10_000);
}

// Assinatura do webhook: HMAC-SHA256 do manifesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// com a chave secreta do painel, comparada em tempo constante ao v1 do cabeçalho x-signature.
// Mesmo algoritmo do SDK oficial (WebhookSignatureValidator).
export function verifyWebhookSignature(input: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }): boolean {
  if (!input.xSignature) return false;
  const parts = Object.fromEntries(
    input.xSignature.split(",").map((part) => {
      const i = part.indexOf("=");
      return [part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()];
    }),
  );
  const { ts, v1 } = parts;
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;
  const manifest = [
    input.dataId ? `id:${input.dataId.toLowerCase()}` : null,
    input.xRequestId ? `request-id:${input.xRequestId}` : null,
    `ts:${ts}`,
  ]
    .filter(Boolean)
    .join(";") + ";";
  const expected = Buffer.from(createHmac("sha256", input.secret).update(manifest).digest("hex"));
  const received = Buffer.from(v1);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
