import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { getPaymentEnv } from "@/lib/env";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { getPaymentAccountStatus } from "@/modules/payments/queries";
import { OrganizationSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações da organização" };

const CONNECT_RESULTS = {
  conectado: { tone: "success", text: "Conta Mercado Pago conectada. Os ingressos pagos já podem receber inscrições." },
  "em-uso": { tone: "danger", text: "Esta conta Mercado Pago já está ligada a outra organização do EventHubs." },
  erro: { tone: "danger", text: "Não foi possível conectar a conta Mercado Pago. Tente novamente." },
} as const;

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
              retém na hora a taxa do EventHubs e as tarifas dele.
            </p>
            <p className="text-ink-muted">
              No parcelamento, os juros são pagos pelo participante, a menos que você ative &quot;parcelamento sem juros&quot; na sua conta Mercado Pago.
              Em caso de reembolso, a taxa do EventHubs não é devolvida à organização.
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
              <a
                href={`/app/${org.slug}/settings/payments/connect`}
                className="inline-flex min-h-11 w-fit items-center rounded-(--radius-control) bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700"
              >
                {account ? "Reconectar conta Mercado Pago" : "Conectar conta Mercado Pago"}
              </a>
            ) : (
              <p className="text-ink-muted">Pagamentos ainda não foram configurados nesta instalação do EventHubs.</p>
            )}
          </div>
        </Card>
      ) : null}
      <Card>
        <CardTitle>Endereço público</CardTitle>
        <p className="mt-2 text-sm text-ink-muted">
          Seu endereço é <span className="font-semibold text-ink">/{org.slug}</span>. A alteração do endereço
          depende de redirecionamentos e chega em uma próxima etapa, para não quebrar links já publicados.
        </p>
      </Card>
    </div>
  );
}
