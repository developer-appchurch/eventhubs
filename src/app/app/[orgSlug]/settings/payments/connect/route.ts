import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv, getPaymentEnv } from "@/lib/env";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { OAUTH_COOKIE, OAUTH_REDIRECT_PATH } from "@/modules/payments/oauth";
import { authorizationUrl, pkcePair } from "@/modules/payments/mercadopago";

// Início da conexão com o Mercado Pago: state contra CSRF e PKCE, guardados em cookie
// httpOnly de 10 minutos. Só owner/admin.
export async function GET(_request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  const env = getPaymentEnv();
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  if (!org || !canManageOrganization(org.role) || !env) return NextResponse.redirect(`${appUrl}/app/${orgSlug}/settings`);

  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  (await cookies()).set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, verifier, org: org.slug })).toString("base64url"), {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: OAUTH_REDIRECT_PATH,
    maxAge: 600,
  });
  return NextResponse.redirect(
    authorizationUrl({ clientId: env.MERCADOPAGO_CLIENT_ID, redirectUri: `${appUrl}${OAUTH_REDIRECT_PATH}`, state, codeChallenge: challenge }),
  );
}
