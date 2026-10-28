import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/datetime";
import { listPublicEvents } from "@/modules/events/queries";
import { FORMAT_LABELS } from "@/modules/events/status";
import { redirectIfOrganizationRenamed } from "@/modules/organizations/queries";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await listPublicEvents((await params).orgSlug);
  return { title: data ? `Eventos de ${data.organization.name}` : "Organização não encontrada" };
}

export default async function PublicOrganizationPage({ params }: Props) {
  const { orgSlug } = await params;
  const data = await listPublicEvents(orgSlug);
  if (!data) {
    await redirectIfOrganizationRenamed(orgSlug);
    notFound();
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{data.organization.name}</h1>
      {data.events.length === 0 ? (
        <EmptyState title="Nenhum evento aberto no momento">Volte em breve para conferir os próximos eventos.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.events.map((event) => (
            <li key={event.slug}>
              <Link
                href={`/${data.organization.slug}/${event.slug}`}
                className="grid h-full gap-2 rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card) hover:border-brand-500"
              >
                <span className="text-lg font-semibold">{event.title}</span>
                <span className="text-sm text-ink-muted">{formatDate(event.starts_at, event.timezone)}</span>
                <span className="text-sm text-ink-muted">
                  {FORMAT_LABELS[event.format]}
                  {event.venue_name && event.format !== "online" ? ` · ${event.venue_name}` : ""}
                </span>
                <span>
                  <EventStatusBadge status={event.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
