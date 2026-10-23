import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getOrganizationContext, listTeam } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { notFound } from "next/navigation";
import { countEvents } from "@/modules/events/queries";

export const metadata: Metadata = { title: "Visão geral" };

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const [team, events] = await Promise.all([listTeam(org.id), countEvents(org.id)]);
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
          <p className="text-sm font-medium text-ink-muted">Eventos</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{events.total}</p>
          <p className="mt-1 text-sm text-ink-muted">{events.published} publicado{events.published === 1 ? "" : "s"}</p>
          <Link href={`/app/${org.slug}/events`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Ver eventos
          </Link>
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
            <span className="text-ink-muted">
              {events.total > 0 ? "Cadastre ingressos e publique seus eventos." : "Crie o primeiro evento em Eventos."}
            </span>
          </li>
        </ol>
      </Card>
    </div>
  );
}
