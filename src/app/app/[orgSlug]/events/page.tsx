import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatShortDate } from "@/lib/datetime";
import { EVENTS_PAGE_SIZE, listEvents } from "@/modules/events/queries";
import { canManageEvents, FORMAT_LABELS } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";

export const metadata: Metadata = { title: "Eventos" };

const linkButton = "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Eventos</h2>
        {canManage ? (
          <Link href={`${base}/new`} className={linkButton}>
            Novo evento
          </Link>
        ) : null}
      </div>

      {events.length === 0 ? (
        <EmptyState title="Nenhum evento ainda">
          {canManage
            ? "Crie o primeiro evento. Ele começa como rascunho e só aparece ao público depois de publicado."
            : "Quando a equipe criar eventos, eles aparecerão aqui."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-muted text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Evento</th>
                <th scope="col" className="px-4 py-3 font-medium">Início</th>
                <th scope="col" className="px-4 py-3 font-medium">Formato</th>
                <th scope="col" className="px-4 py-3 font-medium">Capacidade</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`${base}/${event.id}`} className="font-semibold text-brand-700 hover:underline">
                      {event.title}
                    </Link>
                    <p className="text-xs text-ink-muted">/{org.slug}/{event.slug}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatShortDate(event.starts_at, event.timezone)}</td>
                  <td className="px-4 py-3">{FORMAT_LABELS[event.format]}</td>
                  <td className="px-4 py-3 tabular-nums">{event.capacity.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <EventStatusBadge status={event.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
