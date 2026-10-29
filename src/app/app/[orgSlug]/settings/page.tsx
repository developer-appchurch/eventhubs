import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { getPaymentEnv } from "@/lib/env";
import { getCurrentUser } from "@/modules/auth/session";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { appOwnerUserId } from "@/modules/payments/mercadopago";
import { getPaymentAccountStatus } from "@/modules/payments/queries";
import { DisconnectPaymentsButton } from "./disconnect-payments-button";
import { OrganizationSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações da organização" };

const CONNECT_RESULTS = {
  conectado: { tone: "success", text: "Conta Mercado Pago conectada. Os ingressos pagos já podem receber inscrições." },
  erro: { tone: "danger", text: "Não foi possível conectar a conta Mercado Pago. Tente novamente." },
} as const;

// Só o dono da plataforma vê se a conta conectada é a dona da aplicação: nela o Mercado Pago
// recusa a taxa da plataforma no Pix (cause 2059).
const PLATFORM_OWNER_EMAIL = "developer.appchurch@gmail.com";

async function isAppOwnerAccount(sellerId: string): Promise<boolean | null> {
  const env = getPaymentEnv();
  if (!env) return null;
  try {
    return (await appOwnerUserId({ clientId: env.MERCADOPAGO_CLIENT_ID, clientSecret: env.MERCADOPAGO_CLIENT_SECRET })) === sellerId;
  } catch (error) {
    console.error("[pagamentos] falha ao consultar a conta da aplicação", { error: error instanceof Error ? error.message : "erro" });
    return null;
  }
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ pagamentos?: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const canEdit = canManageOrganization(org.role);
  const account = canEdit ? await getPaymentAccountStatus(org.id) : null;
  const paymentsConfigured = getPaymentEnv() !== null;
  const isPlatformOwner = account ? (await getCurrentUser())?.email?.toLowerCase() === PLATFORM_OWNER_EMAIL : false;
  const appOwnerAccount = account && isPlatformOwner ? await isAppOwnerAccount(account.provider_user_id) : null;
  const result = CONNECT_RESULTS[(await searchParams).pagamentos as keyof typeof CONNECT_RESULTS];

  return (
    <div className="grid gap-6">
      <Card>
        <CardTitle>Dados da organização</CardTitle>
        <div className="mt-5">
          {canEdit ? (
            <OrganizationSettingsForm organizationSlug={org.slug} initialName={org.name} />
          ) : (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-medium text-ink-muted">Nome</dt>
                <dd className="font-semibold">{org.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-muted">Endereço público</dt>
                <dd className="font-semibold">/{org.slug}</dd>
              </div>
              <p className="text-ink-muted">Apenas proprietários e administradores podem alterar estes dados.</p>
            </dl>
          )}
        </div>
      </Card>
      {canEdit ? (
        <Card>
          <CardTitle>Pagamentos</CardTitle>
          <div className="mt-2 grid gap-3 text-sm">
            {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
            <p className="text-ink-muted">
              Os ingressos pagos são cobrados pelo Mercado Pago, na conta da própria organização. O valor vai direto para ela, e o Mercado Pago
              retém na hora a taxa do EventHub e as tarifas dele.
            </p>
            <p className="text-ink-muted">
              No parcelamento, os juros são pagos pelo participante, a menos que você ative &quot;parcelamento sem juros&quot; na sua conta Mercado Pago.
              Em caso de reembolso, a taxa do EventHub não é devolvida à organização.
            </p>
            {account ? (
              <p>
                Conta conectada: <span className="font-semibold">{account.provider_user_id}</span>
                {account.live_mode ? "" : " (modo de teste)"}, desde {formatDateTime(account.connected_at, "America/Sao_Paulo")}.
              </p>
            ) : (
              <p className="font-medium">Nenhuma conta conectada: ingressos pagos não aceitam inscrição.</p>
            )}
            {paymentsConfigured ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/app/${org.slug}/settings/payments/connect`}
                  className="inline-flex min-h-11 w-fit items-center rounded-(--radius-control) bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700"
                >
                  {account ? "Reconectar conta Mercado Pago" : "Conectar conta Mercado Pago"}
                </a>
                {isPlatformOwner && account ? (
                  <Badge tone={appOwnerAccount === null ? "neutral" : appOwnerAccount ? "danger" : "success"}>
                    {appOwnerAccount === null ? "Dona da aplicação: não verificado" : appOwnerAccount ? "Conta dona da aplicação: Pix falha" : "Conta diferente da dona da aplicação"}
                  </Badge>
                ) : null}
              </div>
            ) : (
              <p className="text-ink-muted">Pagamentos ainda não foram configurados nesta instalação do EventHub.</p>
            )}
            {account ? (
              <>
                <p className="text-ink-muted">
                  Para trocar de conta, saia do Mercado Pago neste navegador e use &quot;Reconectar&quot; com a outra conta, ou desconecte esta.
                </p>
                <DisconnectPaymentsButton organizationSlug={org.slug} />
              </>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
