import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { getEvent, listTicketTypes } from "@/modules/events/queries";
import { canManageEvents, FORMAT_LABELS } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventForm } from "../event-form";
import { DeleteEventForm, DuplicateEventForm } from "./delete-event-form";

export const metadata: Metadata = { title: "Evento" };

export default async function EventDetailsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event) notFound();

  const manager = canManageEvents(org.role);
  const editable = manager && event.status !== "ended" && event.status !== "cancelled";

  // Excluir só aparece sem nenhuma inscrição; a função delete_event confere de novo sob trava.
  const supabase = await createSupabaseServerClient();
  const { count } = manager ? await supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", event.id) : { count: null };
  const actions = manager ? (
    <>
      <DuplicateEventForm organizationSlug={org.slug} eventId={event.id} />
      {count === 0 ? <DeleteEventForm organizationSlug={org.slug} eventId={event.id} /> : null}
    </>
  ) : null;

  if (!editable) {
    return (
      <div className="grid gap-6">
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
      {actions}
      </div>
    );
  }

  const tickets = (await listTicketTypes(event.id)).filter((t) => t.is_active).map((t) => ({ ...t, sold_out: false }));

  return (
    <div className="grid gap-6">
      <Card>
        <CardTitle>Detalhes do evento</CardTitle>
        <div className="mt-6">
          <EventForm organizationSlug={org.slug} organizationName={org.name} event={event} tickets={tickets} slugLocked={event.published_at !== null} />
        </div>
      </Card>
      {actions}
    </div>
  );
}
