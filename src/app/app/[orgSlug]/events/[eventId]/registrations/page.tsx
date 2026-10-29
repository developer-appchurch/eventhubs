import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/datetime";
import { getOrganizationEvent, isUuid, listTicketTypes } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import {
  countRegistrations,
  listFormVersions,
  listRegistrations,
  PRESENCE_FILTERS,
  type PresenceFilter,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  REGISTRATIONS_PAGE_SIZE,
  type RegistrationStatus,
} from "@/modules/registrations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { RegistrationActions } from "./registration-actions";

export const metadata: Metadata = { title: "Inscrições" };

const STATUS_TONES = { pending_payment: "warning", confirmed: "success", cancelled: "danger", expired: "neutral", refunded: "neutral" } as const;

type SearchParams = { q?: string; status?: string; ticket?: string; presence?: string; page?: string };

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { orgSlug, eventId } = await params;
  const { org, event } = await getOrganizationEvent(orgSlug, eventId);
  if (!org || !event || !canReadRegistrations(org.role)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = REGISTRATION_STATUSES.includes(sp.status as RegistrationStatus) ? (sp.status as RegistrationStatus) : undefined;
  const presence = PRESENCE_FILTERS.includes(sp.presence as PresenceFilter) ? (sp.presence as PresenceFilter) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Tudo em paralelo: um ingresso de outro evento só filtra por event_id e volta vazio.
  const ticketFilter = sp.ticket && isUuid(sp.ticket) ? sp.ticket : undefined;
  const [tickets, { registrations, total }, counts, forms] = await Promise.all([
    listTicketTypes(event.id),
    listRegistrations(event.id, { q, status, ticket: ticketFilter, presence, page }),
    countRegistrations(event.id),
    listFormVersions(event.id),
  ]);
  const ticket = tickets.some((t) => t.id === ticketFilter) ? ticketFilter : undefined;
  const ticketNames = new Map(tickets.map((t) => [t.id, t.name]));
  const pages = Math.max(1, Math.ceil(total / REGISTRATIONS_PAGE_SIZE));
  const base = `/app/${org.slug}/events/${event.id}/registrations`;
  const filters = { q, ...(status ? { status } : {}), ...(ticket ? { ticket } : {}), ...(presence ? { presence } : {}) };
  const pageHref = (n: number) => `${base}?${new URLSearchParams({ ...filters, page: String(n) })}`;
  const filtered = Boolean(q || status || ticket || presence);
  const occupied = counts.confirmed + counts.pending_payment;
  const canManage = canManageEvents(org.role);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        {occupied.toLocaleString("pt-BR")} de {event.capacity.toLocaleString("pt-BR")} vagas ocupadas · {counts.confirmed.toLocaleString("pt-BR")} confirmadas
        {counts.cancelled ? ` · ${counts.cancelled.toLocaleString("pt-BR")} canceladas` : ""}
      </p>

      <form method="get" className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" role="search">
        <label className="col-span-2 grid gap-1.5 text-sm font-medium">
          Buscar
          <input name="q" defaultValue={q} placeholder="Nome ou e-mail" className={inputClass()} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Situação
          <select name="status" defaultValue={status ?? ""} className={inputClass()}>
            <option value="">Todas</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REGISTRATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Ingresso
          <select name="ticket" defaultValue={ticket ?? ""} className={inputClass()}>
            <option value="">Todos</option>
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Presença
          <select name="presence" defaultValue={presence ?? ""} className={inputClass()}>
            <option value="">Todas</option>
            <option value="present">Presentes</option>
            <option value="absent">Ausentes</option>
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          Filtrar
        </button>
        {canManage ? (
          <a href={`${base}/export?${new URLSearchParams(filters)}`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-700 hover:underline">
            Exportar CSV
          </a>
        ) : null}
      </form>

      {registrations.length === 0 ? (
        <EmptyState icon="users" title={filtered ? "Nenhuma inscrição encontrada" : "Nenhuma inscrição ainda"}>
          {filtered ? "Ajuste a busca ou os filtros." : "As inscrições feitas na página pública aparecem aqui."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {registrations.map((r) => {
            const form = forms.get(r.form_id) ?? [];
            const labels = new Map(form.map((f) => [f.key, f.label]));
            // Nome e e-mail já aparecem no resumo.
            const identity = new Set(form.filter((f) => f.type === "name" || f.type === "email").map((f) => f.key));
            const extra = Object.entries(r.answers).filter(([key]) => !identity.has(key));
            return (
              <li key={r.id} className="flex items-start rounded-(--radius-card) border border-line bg-surface">
                <details className="min-w-0 flex-1">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="block font-semibold">{r.attendee_name}</span>
                      <span className="block text-ink-muted break-all">{r.attendee_email}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      <span>{ticketNames.get(r.ticket_type_id)}</span>
                      <span className="tabular-nums text-ink-muted">{formatShortDateTime(r.created_at, event.timezone)}</span>
                      <Badge tone={STATUS_TONES[r.status]}>{REGISTRATION_STATUS_LABELS[r.status]}</Badge>
                      {r.checkins ? <Badge tone="brand">Presente</Badge> : null}
                    </span>
                  </summary>
                  <dl className="grid gap-2 border-t border-line px-4 py-3 text-sm sm:grid-cols-2">
                    {extra.length === 0 ? <p className="text-ink-muted">Sem respostas adicionais.</p> : null}
                    {extra.map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-ink-muted">{labels.get(key) ?? key}</dt>
                        <dd className="whitespace-pre-line">{formatAnswer(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
                {canManage ? (
                  <div className="shrink-0 py-2 pr-2">
                    <RegistrationActions organizationSlug={org.slug} registrationId={r.id} active={r.status === "confirmed" || r.status === "pending_payment"} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="font-semibold text-brand-700 hover:underline">Anterior</Link> : null}
          <span className="text-ink-muted">Página {page} de {pages} · {total.toLocaleString("pt-BR")} inscrições</span>
          {page < pages ? <Link href={pageHref(page + 1)} className="font-semibold text-brand-700 hover:underline">Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}
