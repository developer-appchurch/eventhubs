import "server-only";
import { getEnv, getPaymentEnv, type PaymentEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./crypto";
import { createCheckout, platformFeeCents, refreshTokens, type OAuthTokens } from "./mercadopago";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type StoredAccount = {
  organization_id: string;
  provider_user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string;
};

const RENEW_BEFORE_MS = 7 * 86_400_000;

export async function saveAccount(env: PaymentEnv, organizationId: string, tokens: OAuthTokens, connectedBy: string | null) {
  const { error } = await createSupabaseAdminClient(env.SUPABASE_SECRET_KEY).rpc("save_payment_account", {
    p_org: organizationId,
    p_provider_user_id: tokens.userId,
    p_public_key: tokens.publicKey,
    p_access_token_enc: encryptToken(tokens.accessToken, env.PAYMENT_TOKEN_KEY),
    p_refresh_token_enc: encryptToken(tokens.refreshToken, env.PAYMENT_TOKEN_KEY),
    p_token_expires_at: tokens.expiresAt.toISOString(),
    p_live_mode: tokens.liveMode,
    p_connected_by: connectedBy,
  });
  // 23505: esta conta Mercado Pago já está ligada a outra organização.
  if (error) throw new Error(error.code === "23505" ? ACCOUNT_IN_USE : "Não foi possível salvar a conta de pagamento.");
}

export const ACCOUNT_IN_USE = "ACCOUNT_IN_USE";

// Token do vendedor, renovado quando falta menos de uma semana para vencer (vale 180 dias).
export async function sellerAccess(
  env: PaymentEnv,
  admin: AdminClient,
  by: { organizationId?: string; sellerId?: string },
): Promise<{ organizationId: string; sellerId: string; token: string } | null> {
  const { data, error } = await admin.rpc("get_payment_account", { p_org: by.organizationId ?? null, p_provider_user_id: by.sellerId ?? null });
  if (error) throw new Error("Não foi possível carregar a conta de pagamento.");
  const account = data as StoredAccount | null;
  if (!account) return null;

  let token = decryptToken(account.access_token_enc, env.PAYMENT_TOKEN_KEY);
  if (new Date(account.token_expires_at).getTime() - Date.now() < RENEW_BEFORE_MS) {
    const renewed = await refreshTokens({
      clientId: env.MERCADOPAGO_CLIENT_ID,
      clientSecret: env.MERCADOPAGO_CLIENT_SECRET,
      refreshToken: decryptToken(account.refresh_token_enc, env.PAYMENT_TOKEN_KEY),
    });
    await saveAccount(env, account.organization_id, renewed, null);
    token = renewed.accessToken;
  }
  return { organizationId: account.organization_id, sellerId: account.provider_user_id, token };
}

type CheckoutContext = {
  registration_id: string;
  organization_id: string;
  public_token: string;
  payable: boolean;
  expires_at: string;
  price_cents: number;
  checkout_url: string | null;
  attendee_name: string;
  attendee_email: string;
  ticket: { name: string };
  event: { title: string; slug: string };
  organization: { slug: string };
};

// Link de pagamento de uma inscrição pendente: reaproveita o checkout já criado ou cria um.
// Sem configuração, reserva vencida ou falha no Mercado Pago, devolve null e a página da
// inscrição oferece tentar de novo; a inscrição pendente nunca fica órfã de um jeito que ocupe
// vaga para sempre, porque a reserva vence sozinha.
export async function checkoutUrlFor(publicToken: string): Promise<string | null> {
  const env = getPaymentEnv();
  if (!env) return null;
  const admin = createSupabaseAdminClient(env.SUPABASE_SECRET_KEY);
  const { data, error } = await admin.rpc("checkout_context", { p_token: publicToken });
  if (error) throw new Error("Não foi possível carregar a inscrição.");
  const ctx = data as CheckoutContext | null;
  if (!ctx?.payable) return null;
  if (ctx.checkout_url) return ctx.checkout_url;

  const seller = await sellerAccess(env, admin, { organizationId: ctx.organization_id });
  if (!seller) return null;

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  const fee = platformFeeCents(ctx.price_cents, env.PLATFORM_FEE_BPS);
  const checkout = await createCheckout(seller.token, {
    registrationId: ctx.registration_id,
    title: `${ctx.event.title} · ${ctx.ticket.name}`,
    priceCents: ctx.price_cents,
    platformFeeCents: fee,
    payer: { name: ctx.attendee_name, email: ctx.attendee_email },
    expiresAt: new Date(ctx.expires_at),
    notificationUrl: `${appUrl}/api/v1/webhooks/mercadopago`,
    returnUrl: `${appUrl}/${ctx.organization.slug}/${ctx.event.slug}/inscricao/${ctx.public_token}`,
  });
  const saved = await admin.rpc("set_checkout", {
    p_registration_id: ctx.registration_id,
    p_checkout_url: checkout.url,
    p_platform_fee_cents: fee,
    p_seller_id: seller.sellerId,
  });
  if (saved.error) throw new Error("Não foi possível salvar o checkout.");
  return checkout.url;
}
