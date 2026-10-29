import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/datetime";
import { getOrganizationEvent } from "@/modules/events/queries";
import { canReadPayments } from "@/modules/payments/queries";
import { getEventReport } from "@/modules/reports/queries";

export const metadata: Metadata = { title: "Relatório" };

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export default async function ReportPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const { org, event } = await getOrganizationEvent(orgSlug, eventId);
  if (!org || !event || !canReadPayments(org.role)) notFound();

  const r = await getEventReport(event.id);
  const confirmed = r.by_status.confirmed ?? 0;
  const max = Math.max(1, ...r.daily.map((d) => d.n));
  const stats = [
    { label: "Confirmadas", value: `${confirmed} de ${r.capacity}`, hint: `${pct(confirmed, r.capacity)} das vagas` },
    { label: "Presentes", value: String(r.checked_in), hint: `${pct(r.checked_in, confirmed)} dos confirmados` },
    { label: "Aguardando pagamento", value: String(r.by_status.pending_payment ?? 0), hint: "reservas ainda abertas ou vencidas" },
    { label: "Canceladas, vencidas e reembolsadas", value: String((r.by_status.cancelled ?? 0) + (r.by_status.expired ?? 0) + (r.by_status.refunded ?? 0)), hint: "" },
  ];

  return (
    <div className="grid gap-6">
      {r.finance.attention > 0 ? (
        <Alert tone="warning">{r.finance.attention} pagamento(s) exigem ação. Veja a aba Pagamentos.</Alert>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            data-surface={i === 0 ? "dark" : undefined}
            className={`rounded-(--radius-card) border p-5 shadow-(--shadow-card) ${i === 0 ? "bg-hero border-transparent text-white" : "border-line bg-surface"}`}
          >
            <dt className={`text-sm ${i === 0 ? "text-brand-200" : "text-ink-muted"}`}>{s.label}</dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{s.value}</dd>
            {s.hint ? <dd className={`text-xs ${i === 0 ? "text-brand-200" : "text-ink-muted"}`}>{s.hint}</dd> : null}
          </div>
        ))}
      </dl>

      <Card>
        <CardTitle>Por ingresso</CardTitle>
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-line bg-brand-100 text-xs uppercase tracking-wide text-brand-900">
            <tr className="text-left">
              <th className="py-1 font-semibold">Ingresso</th>
              <th className="py-1 text-right font-semibold">Preço</th>
              <th className="py-1 text-right font-semibold">Confirmadas</th>
            </tr>
          </thead>
          <tbody>
            {r.by_ticket.map((t) => (
              <tr key={t.name} className="border-t border-line hover:bg-brand-50">
                <td className="py-1.5">{t.name}</td>
                <td className="py-1.5 text-right tabular-nums">{t.price_cents === 0 ? "Gratuito" : formatCents(t.price_cents)}</td>
                <td className="py-1.5 text-right tabular-nums">{t.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardTitle>Financeiro</CardTitle>
        <p className="mt-1 text-sm text-ink-muted">
          Valores brutos, como registrados pelo Mercado Pago. Tarifas do Mercado Pago e valor líquido ficam no painel da conta dele.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm text-ink-muted">Aprovado</dt><dd className="text-2xl font-bold tracking-tight tabular-nums text-brand-700">{formatCents(r.finance.approved_cents)}</dd></div>
          <div><dt className="text-sm text-ink-muted">Reembolsado ou contestado</dt><dd className="text-2xl font-bold tracking-tight tabular-nums text-brand-700">{formatCents(r.finance.refunded_cents)}</dd></div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Confirmações por dia</CardTitle>
        {r.daily.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma inscrição confirmada ainda.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5 text-sm">
            {r.daily.map((d) => (
              <li key={d.day} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3">
                <span className="tabular-nums text-ink-muted">{d.day.split("-").reverse().join("/")}</span>
                <span className="h-3 rounded-full bg-brand-100">
                  <span className="block h-3 rounded-full bg-brand-gradient" style={{ width: `${(d.n / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{d.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
