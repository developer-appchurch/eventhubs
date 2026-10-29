import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCents, formatShortDateTime } from "@/lib/datetime";
import { getOrganizationEvent } from "@/modules/events/queries";
import {
  canReadPayments,
  listPayments,
  PAYMENT_ATTENTION_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENTS_PAGE_SIZE,
} from "@/modules/payments/queries";

export const metadata: Metadata = { title: "Pagamentos" };

const TONES = { approved: "success", refunded: "neutral", charged_back: "danger", rejected: "danger", cancelled: "neutral" } as const;

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const { org, event } = await getOrganizationEvent(orgSlug, eventId);
  if (!org || !event || !canReadPayments(org.role)) notFound();

  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { payments, total } = await listPayments(event.id, page);
  const pages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const base = `/app/${org.slug}/events/${event.id}/payments`;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        Valores brutos, como registrados pelo Mercado Pago. A taxa do EventHub é retida na hora do pagamento; as tarifas do Mercado Pago e o valor
        líquido ficam no painel da sua conta Mercado Pago.
      </p>
      {payments.length === 0 ? (
        <EmptyState icon="card" title="Nenhum pagamento ainda">Os pagamentos de ingressos pagos aparecem aqui assim que o Mercado Pago avisa.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {payments.map((p) => (
            <li key={p.id} className="grid gap-2 rounded-(--radius-card) border border-line bg-surface px-4 py-3 text-sm shadow-(--shadow-card)">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">{p.registrations?.attendee_name ?? "Participante"}</span>
                  <span className="block text-ink-muted break-all">
                    {p.registrations?.attendee_email ? `${p.registrations.attendee_email} · ` : ""}Pagamento {p.external_id}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="tabular-nums">{formatCents(p.amount_cents)}</span>
                  {p.platform_fee_cents ? <span className="tabular-nums text-ink-muted">taxa {formatCents(p.platform_fee_cents)}</span> : null}
                  <span className="tabular-nums text-ink-muted">{formatShortDateTime(p.created_at, event.timezone)}</span>
                  <Badge tone={TONES[p.status as keyof typeof TONES] ?? "warning"}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                </span>
              </div>
              {p.attention && p.status !== "refunded" ? <Alert tone="warning">{PAYMENT_ATTENTION_LABELS[p.attention]}</Alert> : null}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={`${base}?page=${page - 1}`} className="font-semibold text-brand-700 hover:underline">Anterior</Link> : null}
          <span className="text-ink-muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={`${base}?page=${page + 1}`} className="font-semibold text-brand-700 hover:underline">Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
