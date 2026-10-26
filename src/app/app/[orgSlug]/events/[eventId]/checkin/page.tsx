import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/datetime";
import { parseCheckinCode } from "@/modules/checkins/code";
import { countCheckins, findByCheckinCode } from "@/modules/checkins/queries";
import { getEvent, listTicketTypes } from "@/modules/events/queries";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { listRegistrations, REGISTRATION_STATUS_LABELS } from "@/modules/registrations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { CheckInButton } from "./check-in-button";

export const metadata: Metadata = { title: "Check-in", referrer: "no-referrer" };

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<{ q?: string; code?: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event || !canReadRegistrations(org.role)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  // Câmera do celular abre o link do QR (?code=); leitor que digita ou busca usa o campo q.
  const code = parseCheckinCode(sp.code) ?? parseCheckinCode(q);
  const search = code ? "" : q.trim();

  const [counts, tickets, found, results] = await Promise.all([
    countCheckins(event.id),
    listTicketTypes(event.id),
    code ? findByCheckinCode(event.id, code) : null,
    search ? listRegistrations(event.id, { q: search, status: "confirmed" }) : null,
  ]);
  const ticketNames = new Map(tickets.map((t) => [t.id, t.name]));
  const unavailable = event.status === "draft" || event.status === "cancelled";
  const common = { organizationSlug: org.slug, eventId: event.id };

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink tabular-nums">{counts.present.toLocaleString("pt-BR")}</span> presentes de{" "}
        {counts.confirmed.toLocaleString("pt-BR")} inscrições confirmadas
      </p>

      {unavailable ? <Alert tone="warning">Check-in indisponível: o evento está em rascunho ou foi cancelado.</Alert> : null}

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-medium">
          Código do QR, nome ou e-mail
          <input name="q" defaultValue={code ?? q} autoFocus autoComplete="off" className={inputClass()} />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>
      <p className="-mt-3 text-sm text-ink-muted">
        Leia o QR com a câmera do celular (o link abre esta tela) ou com um leitor que digita o código no campo acima.
      </p>

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
      ) : results ? (
        results.registrations.length === 0 ? (
          <EmptyState title="Nenhuma inscrição confirmada encontrada">Busque por parte do nome ou do e-mail.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {results.registrations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-sm">
                <span>
                  <span className="block font-semibold">{r.attendee_name}</span>
                  <span className="block text-ink-muted break-all">
                    {r.attendee_email} · {ticketNames.get(r.ticket_type_id)}
                  </span>
                </span>
                {r.checkins ? (
                  <Badge tone="success">Presente desde {formatShortDateTime(r.checkins.checked_in_at, event.timezone)}</Badge>
                ) : unavailable ? null : (
                  <CheckInButton key={r.id} {...common} registrationId={r.id} label="Check-in manual" />
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
