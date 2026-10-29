import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/datetime";
import { parseCheckinCode } from "@/modules/checkins/code";
import { countCheckins, findByCheckinCode } from "@/modules/checkins/queries";
import { type EventRecord, listTicketTypes } from "@/modules/events/queries";
import { listRegistrations, type PresenceFilter, REGISTRATION_STATUS_LABELS, REGISTRATIONS_PAGE_SIZE } from "@/modules/registrations/queries";
import { CheckInButton } from "./check-in-button";
import { QrScanner } from "./qr-scanner";

const FILTERS = ["todos", "pendentes", "presentes"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = { todos: "Todos", pendentes: "Pendentes", presentes: "Presentes" };
const PRESENCE: Record<Filter, PresenceFilter | undefined> = { todos: undefined, pendentes: "absent", presentes: "present" };

export type CheckinSearchParams = { q?: string; code?: string; filtro?: string; page?: string };

// Conteúdo do check-in de um evento: usado na aba do evento e na tela Check-in do menu.
// keep: parâmetros da URL que a busca, as tags e a paginação devem manter (o evento escolhido no menu).
export async function CheckinPanel({
  org,
  event,
  sp,
  keep = {},
}: {
  org: { slug: string };
  event: EventRecord;
  sp: CheckinSearchParams;
  keep?: Record<string, string>;
}) {
  const q = (sp.q ?? "").slice(0, 200);
  // Câmera do celular abre o link do QR (?code=); leitor que digita ou busca usa o campo q.
  const code = parseCheckinCode(sp.code) ?? parseCheckinCode(q);
  const search = code ? "" : q.trim();
  const filter: Filter = FILTERS.find((f) => f === sp.filtro) ?? "todos";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [counts, tickets, found, results] = await Promise.all([
    countCheckins(event.id),
    listTicketTypes(event.id),
    code ? findByCheckinCode(event.id, code) : null,
    listRegistrations(event.id, { q: search, status: "confirmed", presence: PRESENCE[filter], page, byName: true }),
  ]);
  const ticketNames = new Map(tickets.map((t) => [t.id, t.name]));
  const unavailable = event.status === "draft" || event.status === "cancelled";
  const common = { organizationSlug: org.slug, eventId: event.id };
  const pending = Math.max(0, counts.confirmed - counts.present);
  const tagCounts: Record<Filter, number> = { todos: counts.confirmed, pendentes: pending, presentes: counts.present };
  const pages = Math.max(1, Math.ceil(results.total / REGISTRATIONS_PAGE_SIZE));
  const href = (f: Filter, p = 1) =>
    `?${new URLSearchParams({ ...keep, ...(search ? { q: search } : {}), ...(f !== "todos" ? { filtro: f } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="grid gap-5">
      <div data-surface="dark" className="bg-hero grid gap-3 rounded-(--radius-card) p-5 text-white shadow-(--shadow-card)">
        <p className="text-sm text-brand-200">
          <span className="text-3xl font-extrabold tracking-tight text-white tabular-nums">{counts.present.toLocaleString("pt-BR")}</span>{" "}
          presentes de {counts.confirmed.toLocaleString("pt-BR")} inscrições confirmadas
        </p>
        <div role="presentation" className="h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${counts.confirmed > 0 ? Math.min(100, (counts.present / counts.confirmed) * 100) : 0}%` }}
          />
        </div>
      </div>

      {unavailable ? <Alert tone="warning">Check-in indisponível: o evento está em rascunho ou foi cancelado.</Alert> : null}

      {unavailable ? null : <QrScanner />}

      <form method="get" className="flex items-end gap-2" role="search">
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {filter !== "todos" ? <input type="hidden" name="filtro" value={filter} /> : null}
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-semibold">
          Nome, e-mail ou código do QR
          {/* text-base: abaixo de 16px o iPhone amplia a tela ao focar. */}
          <input name="q" type="search" defaultValue={code ?? q} autoFocus autoComplete="off" enterKeyHint="search" className={`${inputClass()} min-h-12 text-base`} />
        </label>
        <button type="submit" className={buttonClass("primary", "min-h-12 shrink-0 px-5")}>
          Buscar
        </button>
      </form>

      <nav aria-label="Filtrar inscritos" className="-mt-2 flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-(--shadow-card) sm:w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={href(f)}
            aria-current={f === filter ? "page" : undefined}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:flex-none sm:px-4 ${
              f === filter ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:bg-brand-100 hover:text-brand-700"
            }`}
          >
            {FILTER_LABELS[f]}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${f === filter ? "bg-white/20" : "bg-brand-100 text-brand-700"}`}>
              {tagCounts[f].toLocaleString("pt-BR")}
            </span>
          </Link>
        ))}
      </nav>

      {code ? (
        found ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{found.attendee_name}</CardTitle>
                <p className="text-sm text-ink-muted break-all">{found.attendee_email}</p>
                <p className="mt-1 text-sm">{ticketNames.get(found.ticket_type_id)}</p>
              </div>
              <Badge tone={found.status === "confirmed" ? "success" : "danger"}>{REGISTRATION_STATUS_LABELS[found.status]}</Badge>
            </div>
            <div className="mt-4">
              {found.checkins ? (
                <Alert tone="warning">Check-in já feito em {formatShortDateTime(found.checkins.checked_in_at, event.timezone)}.</Alert>
              ) : found.status !== "confirmed" ? (
                <Alert tone="danger">Inscrição não confirmada: não é possível registrar presença.</Alert>
              ) : unavailable ? null : (
                <CheckInButton key={code} {...common} code={code} />
              )}
            </div>
          </Card>
        ) : (
          <Alert tone="danger">Código não encontrado neste evento. Confira se o QR é deste evento.</Alert>
        )
      ) : null}

      {results.registrations.length === 0 ? (
        <EmptyState icon="users" title={search ? "Ninguém encontrado" : filter === "pendentes" ? "Todos já fizeram check-in" : "Nenhum inscrito aqui"}>
          {search ? "Busque por parte do nome ou do e-mail." : "Só aparecem inscrições confirmadas."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {results.registrations.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-base font-semibold">{r.attendee_name}</span>
                <span className="block truncate text-ink-muted">{ticketNames.get(r.ticket_type_id)} · {r.attendee_email}</span>
              </span>
              {r.checkins ? (
                <Badge tone="success">Presente · {formatShortDateTime(r.checkins.checked_in_at, event.timezone)}</Badge>
              ) : unavailable ? null : (
                <CheckInButton key={r.id} {...common} registrationId={r.id} label="Check-in" />
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={href(filter, page - 1)} className={buttonClass("secondary")}>Anterior</Link> : <span />}
          <span className="text-ink-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={href(filter, page + 1)} className={buttonClass("secondary")}>Próxima</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
