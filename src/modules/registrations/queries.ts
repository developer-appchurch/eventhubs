import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventFormat, EventStatus } from "@/modules/events/status";

export const REGISTRATION_STATUSES = ["pending_payment", "confirmed", "cancelled", "expired", "refunded"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: "Aguardando pagamento",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  expired: "Expirada",
  refunded: "Reembolsada",
};

export type PublicRegistration = {
  status: RegistrationStatus;
  attendee_name: string;
  attendee_email: string;
  created_at: string;
  price_cents: number;
  // Só com inscrição confirmada e evento não cancelado.
  checkin_code: string | null;
  ticket: { name: string };
  organization: { name: string; slug: string };
  event: {
    id: string;
    slug: string;
    title: string;
    status: EventStatus;
    format: EventFormat;
    venue_name: string;
    address: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    contact_email: string | null;
    contact_phone: string | null;
    online_url: string | null;
  };
};

// Consulta do participante pelo token secreto do link; sem token válido, nada é revelado.
export async function getRegistrationByToken(token: string): Promise<PublicRegistration | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_registration", { p_token: token });
  if (error) throw new Error("Não foi possível carregar a inscrição.");
  return data as PublicRegistration | null;
}

export const REGISTRATIONS_PAGE_SIZE = 50;

export type RegistrationListItem = {
  id: string;
  status: RegistrationStatus;
  attendee_name: string;
  attendee_email: string;
  answers: Record<string, unknown>;
  created_at: string;
  ticket_type_id: string;
  form_id: string;
  checkins: { checked_in_at: string } | null;
};

export const PRESENCE_FILTERS = ["present", "absent"] as const;
export type PresenceFilter = (typeof PRESENCE_FILTERS)[number];

// Lista da equipe. A RLS limita a quem administra o evento ou fará o check-in.
export async function listRegistrations(
  eventId: string,
  {
    q = "",
    status,
    ticket,
    presence,
    page = 1,
    pageSize = REGISTRATIONS_PAGE_SIZE,
  }: { q?: string; status?: RegistrationStatus; ticket?: string; presence?: PresenceFilter; page?: number; pageSize?: number },
): Promise<{ registrations: RegistrationListItem[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  // Presentes: junção interna com o check-in; ausentes: junção externa sem check-in.
  const checkins = presence === "present" ? "checkins!inner(checked_in_at)" : "checkins(checked_in_at)";
  let query = supabase
    .from("registrations")
    .select(`id, status, attendee_name, attendee_email, answers, created_at, ticket_type_id, form_id, ${checkins}`, { count: "exact" })
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  // Remove caracteres de sintaxe do filtro do PostgREST e curingas do LIKE.
  const term = q.replace(/[%_,().*\\]/g, " ").trim().slice(0, 100);
  if (term) query = query.or(`attendee_name.ilike.%${term}%,attendee_email.ilike.%${term}%`);
  if (status) query = query.eq("status", status);
  if (ticket) query = query.eq("ticket_type_id", ticket);
  if (presence === "absent") query = query.is("checkins", null);

  const { data, error, count } = await query;
  if (error) throw new Error("Não foi possível carregar as inscrições.");
  return { registrations: (data ?? []) as unknown as RegistrationListItem[], total: count ?? 0 };
}

// Contagem por status do evento inteiro (independente de filtros), sem trazer as linhas.
export async function countRegistrations(eventId: string): Promise<Record<RegistrationStatus, number>> {
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all(
    REGISTRATION_STATUSES.map((status) =>
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", status),
    ),
  );
  if (results.some((r) => r.error)) throw new Error("Não foi possível carregar as inscrições.");
  return Object.fromEntries(REGISTRATION_STATUSES.map((s, i) => [s, results[i].count ?? 0])) as Record<RegistrationStatus, number>;
}

// Versões do formulário do evento: as respostas de cada inscrição são lidas com os rótulos
// da versão em que foram dadas.
export async function listFormVersions(eventId: string): Promise<Map<string, { key: string; label: string; type: string }[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("event_forms").select("id, fields").eq("event_id", eventId);
  if (error) throw new Error("Não foi possível carregar o formulário.");
  return new Map((data ?? []).map((f) => [f.id as string, f.fields as { key: string; label: string; type: string }[]]));
}
