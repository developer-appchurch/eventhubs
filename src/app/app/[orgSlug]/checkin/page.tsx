import type { Metadata } from "next";
import Link from "@/components/navigation/intent-link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { formatShortDateTime } from "@/lib/datetime";
import { countConfirmedByEvent } from "@/modules/checkins/queries";
import { getEvent, isUuid, listEvents } from "@/modules/events/queries";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { CheckinPanel, type CheckinSearchParams } from "../events/[eventId]/checkin/checkin-panel";

export const metadata: Metadata = { title: "Check-in", referrer: "no-referrer" };

// Check-in pelo menu: primeiro a lista de eventos; escolhido um (?evento=), o check-in acontece
// aqui mesmo, sem entrar nas abas do evento. Entram os eventos em andamento e os próximos
// (a recepção abre antes do início), fora rascunho, com inscrição confirmada.
export default async function OrgCheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<CheckinSearchParams & { evento?: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org || !canReadRegistrations(org.role)) notFound();

  const sp = await searchParams;
  const base = `/app/${org.slug}/checkin`;
  const selected = sp.evento && isUuid(sp.evento) ? await getEvent(org.id, sp.evento) : null;
  if (selected) {
    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 text-xl font-bold tracking-tight">{selected.title}</h2>
          <Link href={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
            Trocar evento
          </Link>
        </div>
        <CheckinPanel org={org} event={selected} sp={sp} keep={{ evento: selected.id }} showProgress={false} />
      </div>
    );
  }

  // shortcut: só a primeira página (20) de cada aba; acima disso, paginar aqui também.
  const [current, upcoming] = await Promise.all([listEvents(org.id, 1, "andamento"), listEvents(org.id, 1, "futuros")]);
  const candidates = [...current.events, ...upcoming.events].filter((e) => e.status !== "draft");
  const confirmed = await countConfirmedByEvent(candidates.map((e) => e.id));
  const events = candidates.filter((e) => (confirmed.get(e.id) ?? 0) > 0);
  const href = (id: string) => `${base}?evento=${id}`;

  return (
    <div className="grid gap-6">
      <PageHeader title="Check-in" description="Escolha o evento para registrar a presença dos inscritos." />
      {events.length === 0 ? (
        <EmptyState icon="qr" title="Nenhum evento para check-in agora">
          Aparecem aqui os eventos publicados, em andamento ou próximos, que já têm inscrições confirmadas.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={href(e.id)}
                className="flex min-h-16 items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-card) transition-colors hover:border-brand-500 hover:bg-brand-50"
              >
                <span className="grid min-w-0 gap-1">
                  <span className="truncate text-base font-semibold">{e.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <EventStatusBadge status={e.status} />
                    {formatShortDateTime(e.starts_at, e.timezone)} · {(confirmed.get(e.id) ?? 0).toLocaleString("pt-BR")} inscritos
                  </span>
                </span>
                <Icon name="qr" className="size-6 shrink-0 text-brand-700" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
