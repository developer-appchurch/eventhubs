import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { getEvent } from "@/modules/events/queries";
import { canManageEvents, FORMAT_LABELS } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { EventForm } from "../event-form";
import { DeleteEventForm } from "./delete-event-form";

export const metadata: Metadata = { title: "Evento" };

export default async function EventDetailsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event) notFound();

  const editable = canManageEvents(org.role) && event.status !== "ended" && event.status !== "cancelled";

  if (!editable) {
    return (
      <Card>
        <CardTitle>Detalhes</CardTitle>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Início</dt>
            <dd className="font-medium">{formatDate(event.starts_at, event.timezone)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Término</dt>
            <dd className="font-medium">{formatDate(event.ends_at, event.timezone)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Formato</dt>
            <dd className="font-medium">{FORMAT_LABELS[event.format]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Capacidade</dt>
            <dd className="font-medium">{event.capacity.toLocaleString("pt-BR")}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">
          {canManageEvents(org.role) ? "Eventos encerrados ou cancelados não podem mais ser editados." : "Somente proprietários, administradores e gestores de eventos editam eventos."}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardTitle>Detalhes do evento</CardTitle>
        <div className="mt-6">
          <EventForm organizationSlug={org.slug} event={event} slugLocked={event.published_at !== null} />
        </div>
      </Card>
      {event.status === "draft" && event.published_at === null ? <DeleteEventForm organizationSlug={org.slug} eventId={event.id} /> : null}
    </div>
  );
}
