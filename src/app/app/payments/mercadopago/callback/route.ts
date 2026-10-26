import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv, getPaymentEnv } from "@/lib/env";
import { getCurrentUser } from "@/modules/auth/session";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { exchangeCode } from "@/modules/payments/mercadopago";
import { OAUTH_COOKIE, OAUTH_REDIRECT_PATH } from "@/modules/payments/oauth";
import { ACCOUNT_IN_USE, saveAccount } from "@/modules/payments/service";

// Retorno do Mercado Pago. Confere o state, troca o código pelos tokens e grava a conta da
// organização, depois de verificar de novo, com a sessão, que o usuário é owner/admin dela.
export async function GET(request: Request) {
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: OAUTH_REDIRECT_PATH });

  let saved: { state?: string; verifier?: string; org?: string } = {};
  try {
    saved = JSON.parse(Buffer.from(raw ?? "", "base64url").toString("utf8") || "{}");
  } catch {
    // Cookie adulterado: tratado como ausente.
  }
  const params = new URL(request.url).searchParams;
  const back = (org: string | undefined, result: string) =>
    NextResponse.redirect(org ? `${appUrl}/app/${org}/settings?pagamentos=${result}` : `${appUrl}/app`);

  const env = getPaymentEnv();
  const code = params.get("code");
  if (!env || !saved.state || !saved.verifier || !code || params.get("state") !== saved.state) return back(saved.org, "erro");

  const [user, org] = await Promise.all([getCurrentUser(), getOrganizationContext(saved.org ?? "")]);
  if (!user || !org || !canManageOrganization(org.role)) return back(saved.org, "erro");

  try {
    const tokens = await exchangeCode({
      clientId: env.MERCADOPAGO_CLIENT_ID,
      clientSecret: env.MERCADOPAGO_CLIENT_SECRET,
      code,
      redirectUri: `${appUrl}${OAUTH_REDIRECT_PATH}`,
      codeVerifier: saved.verifier,
    });
    await saveAccount(env, org.id, tokens, user.id);
  } catch (error) {
    console.error("[pagamentos] falha ao conectar conta", { org: org.slug, error: error instanceof Error ? error.message : "erro" });
    return back(org.slug, error instanceof Error && error.message === ACCOUNT_IN_USE ? "em-uso" : "erro");
  }
  return back(org.slug, "conectado");
}
