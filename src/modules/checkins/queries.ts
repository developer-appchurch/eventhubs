import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RegistrationStatus } from "@/modules/registrations/queries";

export type CheckinLookup = {
  id: string;
  status: RegistrationStatus;
  attendee_name: string;
  attendee_email: string;
  ticket_type_id: string;
  checkins: { checked_in_at: string } | null;
};

// Inscrição do evento pelo código do QR. A RLS limita a quem pode ver os inscritos.
export async function findByCheckinCode(eventId: string, code: string): Promise<CheckinLookup | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("registrations")
    .select("id, status, attendee_name, attendee_email, ticket_type_id, checkins(checked_in_at)")
    .eq("event_id", eventId)
    .eq("checkin_code", code)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o código.");
  return data as CheckinLookup | null;
}

export async function countCheckins(eventId: string): Promise<{ present: number; confirmed: number }> {
  const supabase = await createSupabaseServerClient();
  const [present, confirmed] = await Promise.all([
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "confirmed"),
  ]);
  if (present.error || confirmed.error) throw new Error("Não foi possível carregar a presença.");
  return { present: present.count ?? 0, confirmed: confirmed.count ?? 0 };
}

// Inscrições confirmadas por evento (uma contagem leve por evento, em paralelo; sem baixar linhas).
export async function countConfirmedByEvent(eventIds: string[]): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all(
    eventIds.map((id) => supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", id).eq("status", "confirmed")),
  );
  if (results.some((r) => r.error)) throw new Error("Não foi possível carregar as inscrições.");
  return new Map(eventIds.map((id, i) => [id, results[i]!.count ?? 0]));
}
