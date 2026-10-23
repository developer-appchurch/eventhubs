import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/datetime";
import { getEvent, listTicketTypes } from "@/modules/events/queries";
import { getOrganizationContext } from "@/modules/organizations/queries";
import {
  countRegistrations,
  listFormVersions,
  listRegistrations,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  REGISTRATIONS_PAGE_SIZE,
  type RegistrationStatus,
} from "@/modules/registrations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";

export const metadata: Metadata = { title: "Inscrições" };

const STATUS_TONES = { pending_payment: "warning", confirmed: "success", cancelled: "danger", expired: "neutral", refunded: "neutral" } as const;

type SearchParams = { q?: string; status?: string; ticket?: string; page?: string };

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event || !canReadRegistrations(org.role)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = REGISTRATION_STATUSES.includes(sp.status as RegistrationStatus) ? (sp.status as RegistrationStatus) : undefined;
  const tickets = await listTicketTypes(event.id);
  const ticket = tickets.some((t) => t.id === sp.ticket) ? sp.ticket : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [{ registrations, total }, counts, forms] = await Promise.all([
    listRegistrations(event.id, { q, status, ticket, page }),
    countRegistrations(event.id),
    listFormVersions(event.id),
  ]);
  const ticketNames = new Map(tickets.map((t) => [t.id, t.name]));
  const pages = Math.max(1, Math.ceil(total / REGISTRATIONS_PAGE_SIZE));
  const base = `/app/${org.slug}/events/${event.id}/registrations`;
  const pageHref = (n: number) => `${base}?${new URLSearchParams({ q, ...(status ? { status } : {}), ...(ticket ? { ticket } : {}), page: String(n) })}`;
  const occupied = counts.confirmed + counts.pending_payment;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        {occupied.toLocaleString("pt-BR")} de {event.capacity.toLocaleString("pt-BR")} vagas ocupadas · {counts.confirmed.toLocaleString("pt-BR")} confirmadas
        {counts.cancelled ? ` · ${counts.cancelled.toLocaleString("pt-BR")} canceladas` : ""}
      </p>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="grid gap-1.5 text-sm font-medium">
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
        <button type="submit" className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          Filtrar
        </button>
      </form>

      {registrations.length === 0 ? (
        <EmptyState title={q || status || ticket ? "Nenhuma inscrição encontrada" : "Nenhuma inscrição ainda"}>
          {q || status || ticket ? "Ajuste a busca ou os filtros." : "As inscrições feitas na página pública aparecem aqui."}
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
              <li key={r.id} className="rounded-(--radius-card) border border-line bg-surface">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="block font-semibold">{r.attendee_name}</span>
                      <span className="block text-ink-muted break-all">{r.attendee_email}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      <span>{ticketNames.get(r.ticket_type_id)}</span>
                      <span className="tabular-nums text-ink-muted">{formatShortDateTime(r.created_at, event.timezone)}</span>
                      <Badge tone={STATUS_TONES[r.status]}>{REGISTRATION_STATUS_LABELS[r.status]}</Badge>
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
