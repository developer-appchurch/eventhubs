import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventFormat, EventStatus } from "@/modules/events/status";

import { type OrgRegistrationFilters, REGISTRATION_STATUSES, type RegistrationStatus } from "./filters";

export { REGISTRATION_STATUS_LABELS, REGISTRATION_STATUSES, type RegistrationStatus } from "./filters";

export type PublicRegistration = {
  status: RegistrationStatus;
  attendee_name: string;
  attendee_email: string;
  created_at: string;
  price_cents: number;
  // Prazo da reserva de ingresso pago.
  expires_at: string | null;
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

  const term = searchTerm(q);
  if (term) query = query.or(`attendee_name.ilike.%${term}%,attendee_email.ilike.%${term}%`);
  if (status) query = query.eq("status", status);
  if (ticket) query = query.eq("ticket_type_id", ticket);
  if (presence === "absent") query = query.is("checkins", null);

  const { data, error, count } = await query;
  if (error) throw new Error("Não foi possível carregar as inscrições.");
  return { registrations: (data ?? []) as unknown as RegistrationListItem[], total: count ?? 0 };
}

// Remove caracteres de sintaxe do filtro do PostgREST e curingas do LIKE.
function searchTerm(q: string): string {
  return q.replace(/[%_,().*\\]/g, " ").trim().slice(0, 100);
}

export type OrgRegistrationItem = {
  id: string;
  status: RegistrationStatus;
  attendee_name: string;
  attendee_email: string;
  created_at: string;
  event_id: string;
  event: { title: string; timezone: string };
  ticket: { name: string };
  checkins: { checked_in_at: string } | null;
};

// Inscrições de todos os eventos da organização. A RLS aplica os mesmos papéis da lista do evento.
export async function listOrgRegistrations(
  organizationId: string,
  filters: OrgRegistrationFilters,
  page = 1,
  pageSize = REGISTRATIONS_PAGE_SIZE,
): Promise<{ registrations: OrgRegistrationItem[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("registrations")
    .select(
      "id, status, attendee_name, attendee_email, created_at, event_id, event:events(title, timezone), ticket:ticket_types(name), checkins(checked_in_at)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  const term = searchTerm(filters.q);
  if (term) query = query.or(`attendee_name.ilike.%${term}%,attendee_email.ilike.%${term}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.event) query = query.eq("event_id", filters.event);
  if (filters.since) query = query.gte("created_at", filters.since);
  if (filters.until) query = query.lt("created_at", filters.until);

  const { data, error, count } = await query;
  if (error) throw new Error("Não foi possível carregar as inscrições.");
  return { registrations: (data ?? []) as unknown as OrgRegistrationItem[], total: count ?? 0 };
}

// Eventos para o filtro, mais recentes primeiro.
// shortcut: só os 500 eventos mais recentes entram no seletor; acima disso, trocar por busca.
export async function listEventOptions(organizationId: string): Promise<{ id: string; title: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title")
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Não foi possível carregar os eventos.");
  return data ?? [];
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
