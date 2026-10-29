import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { getEvent } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canReadPayments } from "@/modules/payments/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { EventStepNav } from "./event-sub-nav";
import { StatusActions } from "./status-actions";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  // Evento de outra organização ou inexistente: mesma resposta (404).
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event) notFound();

  const base = `/app/${org.slug}/events/${event.id}`;
  const showRegistrations = canReadRegistrations(org.role);
  const showFinance = canReadPayments(org.role);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card) sm:p-5">
        <Link href={`/app/${org.slug}/events`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{event.title}</h2>
          <EventStatusBadge status={event.status} />
          {event.status !== "draft" ? (
            <Link href={`/${org.slug}/${event.slug}`} className="text-sm font-medium text-brand-700 hover:underline" target="_blank">
              Abrir página pública ↗
            </Link>
          ) : null}
        </div>
        {canManageEvents(org.role) ? <StatusActions organizationSlug={org.slug} eventId={event.id} status={event.status} /> : null}
      </div>
      {children}
      <EventStepNav base={base} showRegistrations={showRegistrations} showFinance={showFinance} />
    </div>
  );
}
