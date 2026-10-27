"use server";

import { revalidatePath } from "next/cache";
import { firstErrors, formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEvent, isUuid } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { ticketTypeInputSchema } from "./schemas";

const FORBIDDEN: ActionState = { ok: false, message: "Você não tem permissão para alterar os ingressos deste evento." };

// Evento resolvido pela sessão (RLS) dentro da organização do slug; organization_id e
// event_id gravados vêm daqui, nunca do formulário.
async function managedEvent(formData: FormData) {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  if (!org || !canManageEvents(org.role)) return null;
  const event = await getEvent(org.id, text(formData, "eventId"));
  return event ? { org, event } : null;
}

export async function saveTicketType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await managedEvent(formData);
  if (!ctx) return FORBIDDEN;

  const parsed = ticketTypeInputSchema(ctx.event.timezone).safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    price: text(formData, "price"),
    salesStartAt: text(formData, "salesStartAt"),
    salesEndAt: text(formData, "salesEndAt"),
    quantityLimit: text(formData, "quantityLimit"),
    minPerOrder: text(formData, "minPerOrder"),
    maxPerOrder: text(formData, "maxPerOrder"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };
  if (!ctx.event.is_paid && parsed.data.price_cents > 0) {
    return { ok: false, fieldErrors: { price: "Este evento está marcado como gratuito. Use 0,00 ou marque o evento como pago." } };
  }
  if (parsed.data.quantity_limit !== null && parsed.data.quantity_limit > ctx.event.capacity) {
    return { ok: false, fieldErrors: { quantityLimit: `O limite não pode passar da capacidade do evento (${ctx.event.capacity}).` } };
  }

  const supabase = await createSupabaseServerClient();
  const ticketId = text(formData, "ticketId");
  const { data, error } = isUuid(ticketId)
    ? await supabase.from("ticket_types").update(parsed.data).eq("id", ticketId).eq("event_id", ctx.event.id).select("id")
    : await supabase
        .from("ticket_types")
        .insert({ ...parsed.data, organization_id: ctx.org.id, event_id: ctx.event.id })
        .select("id");

  if (error) return mapDatabaseError(error);
  if (!data?.length) return { ok: false, message: "Este evento não aceita mais alterações de ingressos." };

  revalidatePath(`/app/${ctx.org.slug}/events/${ctx.event.id}/tickets`);
  return { ok: true, message: isUuid(ticketId) ? "Ingresso atualizado." : "Ingresso criado." };
}

export async function deleteTicketType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await managedEvent(formData);
  const ticketId = text(formData, "ticketId");
  if (!ctx || !isUuid(ticketId)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_types").delete().eq("id", ticketId).eq("event_id", ctx.event.id).select("id");
  if (error) return mapDatabaseError(error);
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/${ctx.org.slug}/events/${ctx.event.id}/tickets`);
  return { ok: true, message: "Ingresso excluído." };
}
