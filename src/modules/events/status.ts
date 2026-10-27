import type { OrganizationRole } from "@/modules/organizations/roles";

export const EVENT_STATUSES = ["draft", "published", "registration_closed", "ended", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_FORMATS = ["in_person", "online", "hybrid"] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  registration_closed: "Inscrições encerradas",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

export const FORMAT_LABELS: Record<EventFormat, string> = {
  in_person: "Presencial",
  online: "Online",
  hybrid: "Híbrido",
};

// Espelho de private.event_transition_allowed (o banco é quem garante). Um teste de banco
// compara as duas tabelas para que não divirjam.
export const EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["draft", "registration_closed", "ended", "cancelled"],
  registration_closed: ["published", "ended", "cancelled"],
  ended: [],
  cancelled: [],
};

// Rótulos das ações que levam a cada status, a partir do status atual.
export function transitionLabel(from: EventStatus, to: EventStatus): string {
  if (to === "published") return from === "draft" ? "Publicar" : "Reabrir inscrições";
  if (to === "draft") return "Despublicar";
  if (to === "registration_closed") return "Encerrar inscrições";
  if (to === "ended") return "Marcar como encerrado";
  return "Cancelar evento";
}

// Espelha private.event_manager_roles(): quem cria e administra eventos.
export function canManageEvents(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin" || role === "event_manager";
}

export type Availability = "draft" | "open" | "closed" | "ended" | "cancelled";

// Situação vista pelo público. O status é a decisão do organizador; as datas completam:
// um evento publicado cujo prazo passou aparece como inscrições encerradas, sem job agendado.
export function publicAvailability(
  event: { status: EventStatus; ends_at: string },
  now: Date = new Date(),
): Availability {
  if (event.status === "draft") return "draft";
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "ended" || now >= new Date(event.ends_at)) return "ended";
  if (event.status === "registration_closed") return "closed";
  return "open";
}
