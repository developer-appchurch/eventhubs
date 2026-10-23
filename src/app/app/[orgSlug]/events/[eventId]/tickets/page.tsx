import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCents } from "@/lib/datetime";
import { getEvent, listTicketTypes } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Ingressos" };

export default async function TicketsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event) notFound();

  const tickets = await listTicketTypes(event.id);
  const editable = canManageEvents(org.role) && event.status !== "ended" && event.status !== "cancelled";
  const formProps = { organizationSlug: org.slug, eventId: event.id, timezone: event.timezone };

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        Todos os ingressos disputam a mesma capacidade total de {event.capacity.toLocaleString("pt-BR")} vagas. Para publicar, o evento precisa
        de pelo menos um ingresso ativo.
      </p>

      {tickets.length === 0 ? (
        <EmptyState title="Nenhum ingresso cadastrado">Cadastre ao menos um tipo de ingresso, por exemplo &quot;Gratuito&quot; ou &quot;Inteira&quot;.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-semibold">
                      {ticket.name}
                      {ticket.is_active ? null : <Badge>Inativo</Badge>}
                    </span>
                    <span className="tabular-nums">{ticket.price_cents === 0 ? "Gratuito" : formatCents(ticket.price_cents)}</span>
                  </summary>
                  <div className="mt-5">
                    {editable ? (
                      <TicketForm {...formProps} ticket={ticket} />
                    ) : (
                      <p className="text-sm text-ink-muted">{ticket.description || "Sem descrição."}</p>
                    )}
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <Card>
          <CardTitle>Novo tipo de ingresso</CardTitle>
          <div className="mt-5">
            <TicketForm key={tickets.length} {...formProps} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
