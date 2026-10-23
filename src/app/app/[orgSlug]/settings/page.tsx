import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { OrganizationSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações da organização" };

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const canEdit = canManageOrganization(org.role);

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
