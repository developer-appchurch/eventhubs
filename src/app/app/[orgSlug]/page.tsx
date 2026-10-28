import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
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

  const base = `/app/${org.slug}`;
  const canManage = canManageOrganization(org.role);
  return (
    <div className="grid gap-6">
      <section aria-labelledby="indicadores" className="grid gap-4 sm:grid-cols-3">
        <h2 id="indicadores" className="sr-only">Indicadores</h2>
        <Stat icon="users" label="Membros ativos" value={activeTeam} href={`${base}/team`} link="Ver equipe" />
        <Stat icon="calendar" label="Eventos" value={events.total} href={`${base}/events`} link="Ver eventos" />
        <Stat icon="check" label="Publicados" value={events.published} href={`${base}/events`} link="Gerenciar eventos" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>Próximos passos</CardTitle>
          <ol className="mt-4 grid gap-3 text-sm">
            <li className="flex gap-3">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-success-bg text-xs font-bold text-success-ink">✓</span>
              <span>Organização criada e você é o proprietário.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
              <span className="text-ink-muted">
                {canManage
                  ? "Revise o nome da organização em Configurações."
                  : "Aguarde a equipe configurar a organização."}
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">3</span>
              <span className="text-ink-muted">
                {events.total > 0 ? "Cadastre ingressos e publique seus eventos." : "Crie o primeiro evento em Eventos."}
              </span>
            </li>
          </ol>
        </Card>

        <section data-surface="dark" className="bg-hero relative isolate grid content-start gap-3 overflow-hidden rounded-(--radius-card) p-6 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 -z-10 size-48 rounded-full border border-white/10" />
          <h2 className="text-lg font-semibold">Ações rápidas</h2>
          <Link href={`${base}/events`} className={buttonClass("primary", "justify-between")}>
            Ver eventos <Icon name="arrow" className="size-4" />
          </Link>
          {canManage ? (
            <Link href={`${base}/settings`} className="inline-flex min-h-11 items-center justify-between rounded-(--radius-control) border border-white/25 px-4 text-sm font-semibold hover:bg-white/10">
              Configurações <Icon name="settings" className="size-4" />
            </Link>
          ) : null}
          <Link href={`${base}/team`} className="inline-flex min-h-11 items-center justify-between rounded-(--radius-control) border border-white/25 px-4 text-sm font-semibold hover:bg-white/10">
            Equipe <Icon name="users" className="size-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, href, link }: { icon: IconName; label: string; value: number; href: string; link: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-brand-100 text-brand-700">
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <p className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{value}</p>
      <Link href={href} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
        {link}
      </Link>
    </Card>
  );
}
