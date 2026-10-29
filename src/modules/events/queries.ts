import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormField } from "@/modules/forms/fields";
import { getOrganizationContext } from "@/modules/organizations/queries";
import type { EventFormat, EventStatus } from "./status";

// Consultas administrativas usam a sessão do usuário (RLS). As públicas passam pelas
// funções get_public_event/list_public_events, que só devolvem colunas de exibição.

export const EVENTS_PAGE_SIZE = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_PATTERN.test(value);

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  format: EventFormat;
  starts_at: string;
  timezone: string;
  capacity: number;
};

export type EventRecord = EventListItem & {
  organization_id: string;
  description: string;
  cover_image_url: string | null;
  venue_name: string;
  address: string;
  online_url: string | null;
  ends_at: string;
  contact_email: string | null;
  contact_phone: string | null;
  participant_terms: string;
  published_at: string | null;
  is_paid: boolean;
  sales_start_at: string | null;
};

export type TicketType = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  quantity_limit: number | null;
  min_per_order: number;
  max_per_order: number;
  is_active: boolean;
  position: number;
};

export type PublicTicket = Pick<
  TicketType,
  "id" | "name" | "description" | "price_cents" | "currency" | "sales_start_at" | "sales_end_at" | "min_per_order" | "max_per_order"
> & { sold_out: boolean };

export type PublicEventPayload = {
  organization: { name: string; slug: string };
  payments_enabled: boolean;
  event: Omit<EventRecord, "organization_id" | "online_url" | "published_at" | "is_paid" | "sales_start_at"> & { remaining: number };
  tickets: PublicTicket[];
  form: { version: number; fields: Omit<FormField, "is_active">[] } | null;
};

export type PublicEventList = {
  organization: { name: string; slug: string };
  events: (Pick<EventListItem, "slug" | "title" | "status" | "format" | "starts_at" | "timezone"> & {
    cover_image_url: string | null;
    venue_name: string;
  })[];
};

export const EVENT_TABS = ["andamento", "futuros", "encerrados"] as const;
export type EventTab = (typeof EVENT_TABS)[number];

// Encerrado: status final ou data de término passada. Futuro: ainda não começou. Em andamento: o resto.
interface TabQuery<T> {
  or(filters: string): T;
  not(column: string, operator: string, value: string): T;
  gte(column: string, value: string): T;
  gt(column: string, value: string): T;
  lte(column: string, value: string): T;
}

function tabFilter<T extends TabQuery<T>>(q: T, tab: EventTab, now: string): T {
  if (tab === "encerrados") return q.or(`status.in.(ended,cancelled),ends_at.lt.${now}`);
  const active = q.not("status", "in", "(ended,cancelled)").gte("ends_at", now);
  return tab === "futuros" ? active.gt("starts_at", now) : active.lte("starts_at", now);
}

export async function listEvents(organizationId: string, page = 1, tab: EventTab = "andamento") {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * EVENTS_PAGE_SIZE;
  const base = supabase
    .from("events")
    .select("id, slug, title, status, format, starts_at, ends_at, timezone, capacity", { count: "exact" })
    .eq("organization_id", organizationId);
  const { data, error, count } = await tabFilter(base, tab, new Date().toISOString())
    .order("starts_at", { ascending: tab === "encerrados" ? false : true })
    .range(from, from + EVENTS_PAGE_SIZE - 1);

  if (error) throw new Error("Não foi possível carregar os eventos.");
  return { events: (data ?? []) as (EventListItem & { ends_at: string })[], total: count ?? 0 };
}

export async function countEventsByTab(organizationId: string): Promise<Record<EventTab, number>> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const results = await Promise.all(
    EVENT_TABS.map((tab) =>
      tabFilter(supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId), tab, now),
    ),
  );
  if (results.some((r) => r.error)) throw new Error("Não foi possível carregar os eventos.");
  return Object.fromEntries(EVENT_TABS.map((tab, i) => [tab, results[i]!.count ?? 0])) as Record<EventTab, number>;
}

export async function countEvents(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const [all, published] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["published", "registration_closed"]),
  ]);
  if (all.error || published.error) throw new Error("Não foi possível carregar os indicadores.");
  return { total: all.count ?? 0, published: published.count ?? 0 };
}

export const getEvent = cache(async function getEvent(organizationId: string, eventId: string): Promise<EventRecord | null> {
  if (!isUuid(eventId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar o evento.");
  return data as EventRecord | null;
});

// Organização e evento em paralelo (uma ida ao banco a menos por tela). A RLS já limita o
// evento às organizações do usuário; a comparação garante que é desta organização.
export const getOrganizationEvent = cache(async function getOrganizationEvent(orgSlug: string, eventId: string) {
  if (!isUuid(eventId)) return { org: await getOrganizationContext(orgSlug), event: null };
  const supabase = await createSupabaseServerClient();
  const [org, { data, error }] = await Promise.all([
    getOrganizationContext(orgSlug),
    supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
  ]);
  if (error) throw new Error("Não foi possível carregar o evento.");
  const event = org && data?.organization_id === org.id ? (data as EventRecord) : null;
  return { org, event };
});

export async function listTicketTypes(eventId: string): Promise<TicketType[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_types")
    .select("id, name, description, price_cents, currency, sales_start_at, sales_end_at, quantity_limit, min_per_order, max_per_order, is_active, position")
    .eq("event_id", eventId)
    .order("position")
    .order("created_at");

  if (error) throw new Error("Não foi possível carregar os ingressos.");
  return (data ?? []) as TicketType[];
}

export async function listFormFields(eventId: string): Promise<FormField[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("form_fields")
    .select("key, label, type, required, options, validation, help_text, placeholder, is_active")
    .eq("event_id", eventId)
    .order("position");

  if (error) throw new Error("Não foi possível carregar o formulário.");
  return (data ?? []) as FormField[];
}

export async function getFormVersion(eventId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_forms")
    .select("version")
    .eq("event_id", eventId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.version ?? 0;
}

export async function getPublicEvent(orgSlug: string, eventSlug: string): Promise<PublicEventPayload | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_event", { p_org_slug: orgSlug, p_event_slug: eventSlug });
  if (error) throw new Error("Não foi possível carregar o evento.");
  return data as PublicEventPayload | null;
}

export async function listPublicEvents(orgSlug: string): Promise<PublicEventList | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_public_events", { p_org_slug: orgSlug });
  if (error) throw new Error("Não foi possível carregar os eventos.");
  return data as PublicEventList | null;
}

export async function getEventPreview(eventId: string): Promise<PublicEventPayload | null> {
  if (!isUuid(eventId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_preview", { p_event_id: eventId });
  if (error) return null;
  return data as PublicEventPayload;
}
