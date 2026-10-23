"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstErrors, formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { isUuid } from "./queries";
import { eventInputSchema } from "./schemas";
import { canManageEvents, EVENT_STATUSES, type EventStatus } from "./status";

const FORBIDDEN: ActionState = { ok: false, message: "Você não tem permissão para gerenciar eventos desta organização." };

// Resolve a organização pela sessão e confere o papel. A RLS repete a verificação no banco;
// esta serve para dar uma mensagem clara e para que organization_id nunca venha do cliente.
async function managedOrganization(formData: FormData) {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  return org && canManageEvents(org.role) ? org : null;
}

function eventFields(formData: FormData) {
  const title = text(formData, "title");
  return {
    title,
    slug: text(formData, "slug").trim() || slugify(title).slice(0, 60),
    description: text(formData, "description"),
    coverImageUrl: text(formData, "coverImageUrl"),
    format: text(formData, "format"),
    venueName: text(formData, "venueName"),
    address: text(formData, "address"),
    onlineUrl: text(formData, "onlineUrl"),
    timezone: text(formData, "timezone"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    registrationOpensAt: text(formData, "registrationOpensAt"),
    registrationClosesAt: text(formData, "registrationClosesAt"),
    capacity: text(formData, "capacity"),
    contactEmail: text(formData, "contactEmail"),
    contactPhone: text(formData, "contactPhone"),
    participantTerms: text(formData, "participantTerms"),
  };
}

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  if (!org) return FORBIDDEN;

  const parsed = eventInputSchema.safeParse(eventFields(formData));
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed.data, organization_id: org.id })
    .select("id")
    .single();

  if (error) return mapDatabaseError(error);
  redirect(`/app/${org.slug}/events/${data.id}`);
}

export async function updateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  if (!org || !isUuid(eventId)) return FORBIDDEN;

  const parsed = eventInputSchema.safeParse(eventFields(formData));
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .update(parsed.data)
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .select("id");

  if (error) return mapDatabaseError(error);
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/${org.slug}/events/${eventId}`, "layout");
  return { ok: true, message: "Evento salvo." };
}

export async function changeEventStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  const status = text(formData, "status") as EventStatus;
  if (!org || !isUuid(eventId) || !EVENT_STATUSES.includes(status)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("change_event_status", { p_event_id: eventId, p_status: status });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events`, "layout");
  return { ok: true, message: "Status do evento atualizado." };
}

// Só rascunhos nunca publicados podem ser excluídos (regra da política RLS de DELETE).
export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  if (!org || !isUuid(eventId)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("events").delete().eq("id", eventId).eq("organization_id", org.id).select("id");
  if (error) return mapDatabaseError(error);
  if (!data?.length) return { ok: false, message: "Só é possível excluir rascunhos que nunca foram publicados. Cancele o evento." };

  revalidatePath(`/app/${org.slug}/events`);
  redirect(`/app/${org.slug}/events`);
}
