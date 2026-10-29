"use server";

import { revalidatePath } from "next/cache";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { formatShortDateTime } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEvent, isUuid } from "@/modules/events/queries";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { parseCheckinCode } from "./code";

const FORBIDDEN: ActionState = { ok: false, message: "Você não tem permissão para fazer check-in neste evento." };

// Registra a presença pelo código do QR ou pela inscrição (manual). A função do banco repete
// a verificação de papel, evento e status; uma segunda leitura devolve o check-in original.
export async function checkIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  const eventId = text(formData, "eventId");
  if (!org || !canReadRegistrations(org.role) || !isUuid(eventId)) return FORBIDDEN;
  const event = await getEvent(org.id, eventId);
  if (!event) return FORBIDDEN;

  const code = parseCheckinCode(text(formData, "code"));
  const registrationId = text(formData, "registrationId");
  if (!code && !isUuid(registrationId)) return mapDatabaseError({ code: "P0001", message: "CHECKIN_NOT_FOUND" });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in", {
    p_event_id: event.id,
    p_code: code,
    p_registration_id: code ? null : registrationId,
  });
  if (error) return mapDatabaseError(error);

  const result = data as { result: "checked_in" | "already_checked_in"; attendee_name: string; checked_in_at: string; checked_in_by: string | null };
  revalidatePath(`/app/${org.slug}/events/${event.id}`, "layout");
  revalidatePath(`/app/${org.slug}/checkin`);
  if (result.result === "checked_in") return { ok: true, message: `Presença registrada: ${result.attendee_name}.` };
  const by = result.checked_in_by ? ` por ${result.checked_in_by}` : "";
  return { ok: false, message: `${result.attendee_name} já fez check-in em ${formatShortDateTime(result.checked_in_at, event.timezone)}${by}.` };
}

// Desfaz um check-in lançado por engano. O banco repete papel e organização.
export async function undoCheckIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  const eventId = text(formData, "eventId");
  const registrationId = text(formData, "registrationId");
  if (!org || !canReadRegistrations(org.role) || !isUuid(eventId) || !isUuid(registrationId)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("undo_check_in", { p_registration_id: registrationId });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events/${eventId}`, "layout");
  revalidatePath(`/app/${org.slug}/checkin`);
  return { ok: true, message: "Check-in desfeito." };
}
