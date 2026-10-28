import { DEFAULT_TIMEZONE, zonedLocalToUtc } from "@/lib/datetime";

export const REGISTRATION_STATUSES = ["pending_payment", "confirmed", "cancelled", "expired", "refunded"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: "Aguardando pagamento",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  expired: "Expirada",
  refunded: "Reembolsada",
};

export type OrgRegistrationFilters = {
  q: string;
  status?: RegistrationStatus;
  event?: string;
  // Período da inscrição em datas "AAAA-MM-DD" (como vieram) e os limites UTC [since, until).
  from?: string;
  to?: string;
  since?: string;
  until?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filtros da tela geral de inscrições, a partir da URL. Valores inválidos são ignorados.
// O período usa o fuso padrão: "até 10/11" inclui o dia 10 inteiro.
export function parseOrgRegistrationFilters(get: (key: string) => string | null | undefined): OrgRegistrationFilters {
  const status = get("status") as RegistrationStatus;
  const event = get("event") ?? "";
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  const since = zonedLocalToUtc(`${from}T00:00`, DEFAULT_TIMEZONE);
  const end = zonedLocalToUtc(`${to}T00:00`, DEFAULT_TIMEZONE);
  const until = end ? zonedLocalToUtc(`${nextDay(to)}T00:00`, DEFAULT_TIMEZONE) : null;
  return {
    q: (get("q") ?? "").slice(0, 100),
    ...(REGISTRATION_STATUSES.includes(status) ? { status } : {}),
    ...(UUID.test(event) ? { event } : {}),
    ...(since ? { from, since: since.toISOString() } : {}),
    ...(until ? { to, until: until.toISOString() } : {}),
  };
}

// Parâmetros de URL dos filtros (sem os limites calculados), para links de página e exportação.
export function filterParams(f: OrgRegistrationFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ q: f.q, status: f.status, event: f.event, from: f.from, to: f.to }).filter(([, v]) => v),
  ) as Record<string, string>;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
