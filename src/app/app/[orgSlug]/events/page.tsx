import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { formatShortDate } from "@/lib/datetime";
import { EVENTS_PAGE_SIZE, listEvents } from "@/modules/events/queries";
import { canManageEvents, FORMAT_LABELS } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";

export const metadata: Metadata = { title: "Eventos" };

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { events, total } = await listEvents(org.id, page);
  const pages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));
  const canManage = canManageEvents(org.role);
  const base = `/app/${org.slug}/events`;

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

      {events.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nenhum evento ainda"
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
                      <Icon name="calendar" className="size-4 text-brand-600" /> {formatShortDate(event.starts_at, event.timezone)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="pin" className="size-4 text-brand-600" /> {FORMAT_LABELS[event.format]}
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Icon name="users" className="size-4 text-brand-600" /> {event.capacity.toLocaleString("pt-BR")} vagas
                    </span>
                  </span>
                </div>
                <EventStatusBadge status={event.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={`${base}?page=${page - 1}`} className="font-semibold text-brand-700 hover:underline">Anterior</Link> : null}
          <span className="text-ink-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={`${base}?page=${page + 1}`} className="font-semibold text-brand-700 hover:underline">Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
