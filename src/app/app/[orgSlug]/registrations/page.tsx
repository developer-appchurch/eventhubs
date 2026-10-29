import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { formatDayTime, formatShortDateTime } from "@/lib/datetime";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { filterParams, parseOrgRegistrationFilters } from "@/modules/registrations/filters";
import {
  listEventOptions,
  listOrgRegistrations,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  REGISTRATIONS_PAGE_SIZE,
} from "@/modules/registrations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";

export const metadata: Metadata = { title: "Inscrições" };

const STATUS_TONES = { pending_payment: "warning", confirmed: "success", cancelled: "danger", expired: "neutral", refunded: "neutral" } as const;

export default async function OrgRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org || !canReadRegistrations(org.role)) notFound();

  const sp = await searchParams;
  const filters = parseOrgRegistrationFilters((key) => sp[key]);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ registrations, total }, events] = await Promise.all([
    listOrgRegistrations(org.id, filters, page),
    listEventOptions(org.id),
  ]);
  const pages = Math.max(1, Math.ceil(total / REGISTRATIONS_PAGE_SIZE));
  const base = `/app/${org.slug}/registrations`;
  const query = filterParams(filters);
  const pageHref = (n: number) => `${base}?${new URLSearchParams({ ...query, page: String(n) })}`;
  const exportHref = (format: string) => `${base}/export?${new URLSearchParams({ ...query, format })}`;
  const filtered = Object.keys(query).length > 0;
  const link = "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-700 hover:underline";

  return (
    <div className="grid gap-6">
      <PageHeader title="Inscrições" description="Inscrições de todos os eventos da organização." />

      <form method="get" className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" role="search">
        <label className="col-span-2 grid gap-1.5 text-sm font-medium">
          Buscar
          <input name="q" defaultValue={filters.q} placeholder="Nome ou e-mail" className={inputClass()} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Evento
          <select name="event" defaultValue={filters.event ?? ""} className={`${inputClass()} sm:max-w-64`}>
            <option value="">Todos</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Situação
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass()}>
            <option value="">Todas</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REGISTRATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          De
          <input type="date" name="from" defaultValue={filters.from} className={inputClass()} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Até
          <input type="date" name="to" defaultValue={filters.to} className={inputClass()} />
        </label>
        {/* No celular as ações ficam juntas numa linha; no desktop seguem soltas no fluxo dos filtros. */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-1 gap-y-2 sm:contents">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            Filtrar
          </button>
          {filtered ? (
            <Link href={base} className={link}>
              Limpar
            </Link>
          ) : null}
          {/* Como na lista do evento: o operador de check-in vê, mas não exporta dados pessoais. */}
          {canManageEvents(org.role) && total > 0 ? (
            <>
              <a href={exportHref("csv")} className={link}>
                Exportar CSV
              </a>
              <a href={exportHref("pdf")} target="_blank" rel="noopener" className={link}>
                Exportar PDF
              </a>
            </>
          ) : null}
        </div>
      </form>

      {registrations.length === 0 ? (
        <EmptyState icon="users" title={filtered ? "Nenhuma inscrição encontrada" : "Nenhuma inscrição ainda"}>
          {filtered ? "Ajuste a busca ou os filtros." : "As inscrições feitas nas páginas públicas dos eventos aparecem aqui."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {registrations.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{r.attendee_name}</span>
                <span className="block text-ink-muted break-all">{r.attendee_email}</span>
              </span>
              {/* No celular só data curta e selos; evento e ingresso ficam para o desktop. */}
              <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0">
                <span className="hidden min-w-0 sm:inline">
                  <Link href={`/app/${org.slug}/events/${r.event_id}/registrations`} className="font-medium text-brand-700 hover:underline">
                    {r.event.title}
                  </Link>
                </span>
                <span className="hidden sm:inline">{r.ticket.name}</span>
                <span className="tabular-nums text-ink-muted">
                  <span className="sm:hidden">{formatDayTime(r.created_at, r.event.timezone)}</span>
                  <span className="hidden sm:inline">{formatShortDateTime(r.created_at, r.event.timezone)}</span>
                </span>
                <span className="flex flex-wrap gap-2 sm:contents">
                  <Badge tone={STATUS_TONES[r.status]}>{REGISTRATION_STATUS_LABELS[r.status]}</Badge>
                  {r.checkins ? <Badge tone="brand">Presente</Badge> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > 0 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="font-semibold text-brand-700 hover:underline">Anterior</Link> : null}
          <span className="text-ink-muted">Página {page} de {pages} · {total.toLocaleString("pt-BR")} inscrições</span>
          {page < pages ? <Link href={pageHref(page + 1)} className="font-semibold text-brand-700 hover:underline">Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
