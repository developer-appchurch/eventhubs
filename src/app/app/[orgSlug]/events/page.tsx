import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countConfirmedByEvent } from "@/modules/checkins/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { formatShortDate } from "@/lib/datetime";
import { countEventsByTab, EVENT_TABS, EVENTS_PAGE_SIZE, listEvents, type EventTab } from "@/modules/events/queries";
import { canManageEvents, FORMAT_LABELS } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";

const TAB_LABELS: Record<EventTab, string> = { andamento: "Em andamento", futuros: "Futuros", encerrados: "Encerrados" };

export const metadata: Metadata = { title: "Eventos" };

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const counts = await countEventsByTab(org.id);
  // Sem aba escolhida, abre na primeira que tem eventos.
  const tab: EventTab =
    EVENT_TABS.find((t) => t === sp.tab) ?? EVENT_TABS.find((t) => counts[t] > 0) ?? "andamento";
  const { events, total } = await listEvents(org.id, page, tab);
  const pages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));
  // Só quem pode ver inscrições recebe a contagem: para os demais papéis a RLS devolveria 0, o que enganaria.
  const confirmed = canReadRegistrations(org.role) ? await countConfirmedByEvent(events.map((e) => e.id)) : null;
  const canManage = canManageEvents(org.role);
  const base = `/app/${org.slug}/events`;
  const tabHref = (t: EventTab, p = 1) => `${base}?tab=${t}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Eventos"
        description="Crie, publique e acompanhe os eventos da organização."
        actions={
          canManage ? (
            <Link href={`${base}/new`} className={buttonClass()}>
              <Icon name="plus" className="size-4" /> Novo evento
            </Link>
          ) : undefined
        }
      />

      <nav aria-label="Filtrar eventos" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-(--shadow-card)">
        {EVENT_TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            aria-current={t === tab ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
              t === tab ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:bg-brand-100 hover:text-brand-700"
            }`}
          >
            {TAB_LABELS[t]}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${t === tab ? "bg-white/20" : "bg-brand-100 text-brand-700"}`}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={counts.andamento + counts.futuros + counts.encerrados === 0 ? "Nenhum evento ainda" : `Nenhum evento em ${TAB_LABELS[tab].toLowerCase()}`}
          action={
            canManage ? (
              <Link href={`${base}/new`} className={buttonClass()}>
                <Icon name="plus" className="size-4" /> Criar primeiro evento
              </Link>
            ) : undefined
          }
        >
          {canManage
            ? "Crie o primeiro evento. Ele começa como rascunho e só aparece ao público depois de publicado."
            : "Quando a equipe criar eventos, eles aparecerão aqui."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`${base}/${event.id}`}
                className="group grid gap-3 rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card) transition hover:border-brand-300 hover:shadow-(--shadow-overlay) sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
              >
                <div className="grid gap-1">
                  <span className="text-lg font-semibold text-ink group-hover:text-brand-700">{event.title}</span>
                  <span className="text-xs text-ink-muted">/{org.slug}/{event.slug}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Icon name="calendar" className="size-4 text-brand-600" /> {formatShortDate(event.starts_at, event.timezone)} a {formatShortDate(event.ends_at, event.timezone)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="pin" className="size-4 text-brand-600" /> {FORMAT_LABELS[event.format]}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                  <div className="grid justify-items-start gap-1 sm:justify-items-center">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
                      {confirmed ? "Inscrições / vagas" : "Vagas"}
                    </span>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold tabular-nums text-brand-700">
                      {confirmed ? `${(confirmed.get(event.id) ?? 0).toLocaleString("pt-BR")}/` : ""}
                      {event.capacity.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={tabHref(tab, page - 1)} className="font-semibold text-brand-700 hover:underline">Anterior</Link> : null}
          <span className="text-ink-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={tabHref(tab, page + 1)} className="font-semibold text-brand-700 hover:underline">Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
