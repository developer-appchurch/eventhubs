// Datas são gravadas em UTC (timestamptz). O organizador digita e o público lê no fuso do
// evento. Conversões feitas com Intl, sem dependência extra.

export const EVENT_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Horário de Brasília (UTC−3)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
  { value: "America/Manaus", label: "Amazonas, MT, MS, RO e RR (UTC−4)" },
  { value: "America/Rio_Branco", label: "Acre (UTC−5)" },
] as const;

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function isEventTimezone(value: string): boolean {
  return EVENT_TIMEZONES.some((tz) => tz.value === value);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Diferença (ms) entre o relógio do fuso e UTC naquele instante.
function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "2026-11-20T19:30" (valor de <input type="datetime-local">) no fuso informado -> instante UTC.
// Retorna null para formato ou data inexistente (ex.: 31/02).
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = LOCAL_PATTERN.exec(local);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;

  // Duas passadas corrigem o deslocamento em fusos com horário de verão.
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

// Instante UTC -> valor para <input type="datetime-local"> no fuso do evento.
export function utcToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const p = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}

// Evento tem só data: começa às 00:00 do primeiro dia e termina às 23:59 do último.
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full" }).format(new Date(iso));
}

export function formatShortDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short" }).format(new Date(iso));
}

export function formatShortDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// Máscara de preço enquanto digita: os dígitos entram pelos centavos ("1234" -> "12,34").
export function maskPriceInput(input: string): string {
  const cents = Number(input.replace(/\D/g, "").slice(0, 10) || "0");
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(cents / 100);
}

// "1.234,56", "R$ 50", "50,5" ou "12.90" -> centavos. null se inválido.
export function parsePriceToCents(input: string): number | null {
  let value = input.replace(/R\$|\s/g, "");
  if (value === "") return 0;
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}
