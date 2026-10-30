import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { getOrganizationContext, listTeam } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";
import { notFound } from "next/navigation";
import { countEvents } from "@/modules/events/queries";
import { canReadPayments } from "@/modules/payments/queries";
import { getOrganizationOverview, type OrganizationOverview } from "@/modules/reports/queries";
import { RegistrationsChart } from "./registrations-chart";

export const metadata: Metadata = { title: "Visão geral" };

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const showCharts = canReadPayments(org.role);
  const [team, events, overview] = await Promise.all([
    listTeam(org.id),
    countEvents(org.id),
    showCharts ? getOrganizationOverview(org.id) : null,
  ]);
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

      {overview ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <RegistrationsByDay daily={overview.daily} />
          <RegistrationsByMethod counts={overview.by_method} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>Próximos passos</CardTitle>
          <ol className="mt-4 grid gap-3 text-sm">
            <Step n={1} done>Organização criada.</Step>
            <Step n={2} done={events.total > 0}>Crie o primeiro evento em Eventos.</Step>
            <Step n={3} done={events.published > 0}>Cadastre ingressos e publique seus eventos.</Step>
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

function Step({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-success-bg text-success-ink" : "bg-brand-100 text-brand-700"}`}
      >
        {done ? "✓" : n}
      </span>
      <span className={done ? undefined : "text-ink-muted"}>
        {children}
        <span className="sr-only">{done ? " (concluído)" : " (pendente)"}</span>
      </span>
    </li>
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

function RegistrationsByDay({ daily }: { daily: OrganizationOverview["daily"] }) {
  const total = daily.reduce((sum, d) => sum + d.n, 0);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Inscrições por dia</CardTitle>
        <span className="text-sm text-ink-muted">
          <span className="font-semibold tabular-nums text-ink">{total}</span> nos últimos 30 dias
        </span>
      </div>
      {total === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nenhuma inscrição confirmada nos últimos 30 dias.</p>
      ) : (
        <div className="mt-4">
          <RegistrationsChart daily={daily} />
        </div>
      )}
    </Card>
  );
}

function RegistrationsByMethod({ counts }: { counts: OrganizationOverview["by_method"] }) {
  const slices = [
    { label: "Pix", n: counts.pix, color: "var(--color-brand-700)" },
    { label: "Cartão", n: counts.card, color: "var(--color-brand-300)" },
    { label: "Gratuitas", n: counts.free, color: "var(--color-success-ink)" },
    { label: "Outras ou não informado", n: counts.other, color: "var(--color-line-strong)" },
  ].filter((s) => s.n > 0);
  const total = slices.reduce((sum, s) => sum + s.n, 0);
  let start = 0;
  const gradient = slices
    .map((s) => {
      const end = start + (s.n / total) * 100;
      const stop = `${s.color} ${start}% ${end}%`;
      start = end;
      return stop;
    })
    .join(", ");

  return (
    <Card>
      <CardTitle>Forma de pagamento</CardTitle>
      {total === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nenhuma inscrição confirmada ainda.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div
            aria-hidden="true"
            className="relative grid size-32 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <div className="grid size-20 place-items-center rounded-full bg-surface text-center">
              <span className="text-2xl font-extrabold leading-none tabular-nums">{total}</span>
              <span className="text-[0.65rem] text-ink-muted">confirmadas</span>
            </div>
          </div>
          <ul className="grid gap-2 text-sm">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="ml-auto pl-3 tabular-nums font-semibold">{s.n}</span>
                <span className="w-10 text-right tabular-nums text-ink-muted">{Math.round((s.n / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
