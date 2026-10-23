import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOrganizationContext, listTeam } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Visão geral" };

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const team = await listTeam(org.id);
  const activeTeam = team.filter((member) => member.status === "active").length;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="indicadores" className="grid gap-4 sm:grid-cols-2">
        <h2 id="indicadores" className="sr-only">Indicadores</h2>
        <Card>
          <p className="text-sm font-medium text-ink-muted">Membros ativos</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{activeTeam}</p>
          <Link href={`/app/${org.slug}/team`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Ver equipe
          </Link>
        </Card>
        <Card>
          <p className="text-sm font-medium text-ink-muted">Eventos, inscrições e pagamentos</p>
          <p className="mt-1 flex items-center gap-2 text-base font-semibold">
            <Badge>Em breve</Badge>
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Os indicadores são calculados a partir dos dados reais e aparecem quando o módulo de eventos for publicado.
          </p>
        </Card>
      </section>

      <Card>
        <CardTitle>Próximos passos</CardTitle>
        <ol className="mt-4 grid gap-3 text-sm">
          <li className="flex gap-3">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-success-bg text-xs font-bold text-success-ink">✓</span>
            <span>Organização criada e você é o proprietário.</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold text-ink-muted">2</span>
            <span className="text-ink-muted">
              {canManageOrganization(org.role)
                ? "Revise o nome da organização em Configurações."
                : "Aguarde a equipe configurar a organização."}
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold text-ink-muted">3</span>
            <span className="text-ink-muted">Criar o primeiro evento, disponível na próxima etapa de desenvolvimento.</span>
          </li>
        </ol>
      </Card>
    </div>
  );
}
