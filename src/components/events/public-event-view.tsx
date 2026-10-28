import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCents, formatDate, formatDateTime } from "@/lib/datetime";
import type { PublicEventPayload } from "@/modules/events/queries";
import { FORMAT_LABELS, publicAvailability, type Availability } from "@/modules/events/status";

const AVAILABILITY_MESSAGES: Record<Availability, { tone: "info" | "warning" | "danger" | "success"; text: string }> = {
  draft: { tone: "info", text: "Rascunho: esta página ainda não está disponível ao público." },
  open: { tone: "success", text: "Inscrições abertas." },
  closed: { tone: "warning", text: "As inscrições para este evento estão encerradas." },
  ended: { tone: "warning", text: "Este evento já foi encerrado." },
  cancelled: { tone: "danger", text: "Este evento foi cancelado pelo organizador." },
};

// Página pública do evento. Usada pela rota pública e pela pré-visualização (mesmo
// conteúdo, vindo de get_public_event ou get_event_preview). O texto do organizador é
// renderizado como texto puro (React escapa), sem HTML.
export function PublicEventView({ data, registration }: { data: PublicEventPayload; registration: ReactNode }) {
  const { event, organization, tickets } = data;
  const availability = publicAvailability(event);
  const notice = AVAILABILITY_MESSAGES[availability];
  const tz = event.timezone;

  return (
    // Medidas pelo contêiner (@), não pela tela: a mesma página cabe no celular da pré-visualização.
    <article className="@container grid gap-6">
      {/* Capa como fundo do topo, escurecida para o texto branco manter contraste; sem capa, degradê da marca. */}
      <header className="relative isolate grid justify-items-center gap-4 overflow-hidden rounded-(--radius-card) bg-gradient-to-br from-brand-600 to-brand-900 px-5 py-14 text-center text-white @xl:py-24">
        {event.cover_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL externa definida pelo organizador; sem otimizador. */}
            <img src={event.cover_image_url} alt="" className="absolute inset-0 -z-20 size-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/60 via-ink/55 to-ink/85" aria-hidden />
          </>
        ) : null}
        <p className="text-xs font-semibold tracking-[0.2em] text-brand-100 uppercase">{organization.name}</p>
        <h1 className="max-w-3xl text-3xl font-extrabold text-balance @xl:text-5xl">{event.title}</h1>
        <span className="h-1 w-12 rounded-full bg-accent-400" aria-hidden />
        <p className="text-white/90">
          {formatDate(event.starts_at, tz)} · {FORMAT_LABELS[event.format]}
        </p>
        <a
          href="#inscricao"
          className="mt-2 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-bold tracking-wide text-brand-900 uppercase shadow-(--shadow-overlay) hover:bg-brand-50"
        >
          {availability === "open" ? "Inscreva-se" : "Ver inscrições"}
        </a>
      </header>

      <Alert tone={notice.tone}>{notice.text}</Alert>

      <div className="grid gap-6 @3xl:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          {event.description ? (
            <Card>
              <CardTitle>Sobre o evento</CardTitle>
              <p className="mt-3 whitespace-pre-line text-ink">{event.description}</p>
            </Card>
          ) : null}

          <Card>
            <CardTitle>Ingressos</CardTitle>
            {tickets.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nenhum ingresso disponível no momento.</p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="flex flex-wrap items-start justify-between gap-2 rounded-(--radius-control) border border-line p-4">
                    <div>
                      <p className="font-semibold">{ticket.name}</p>
                      {ticket.description ? <p className="text-sm text-ink-muted">{ticket.description}</p> : null}
                      {ticket.sales_end_at ? (
                        <p className="mt-1 text-xs text-ink-muted">Vendas até {formatDateTime(ticket.sales_end_at, tz)}</p>
                      ) : null}
                    </div>
                    <p className="font-semibold tabular-nums">{ticket.price_cents === 0 ? "Gratuito" : formatCents(ticket.price_cents)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-ink-muted">
              {typeof event.remaining === "number"
                ? event.remaining === 0
                  ? "Vagas esgotadas."
                  : `${event.remaining.toLocaleString("pt-BR")} de ${event.capacity.toLocaleString("pt-BR")} vagas disponíveis.`
                : `Capacidade total: ${event.capacity.toLocaleString("pt-BR")} vagas.`}
            </p>
          </Card>

          <section id="inscricao" className="scroll-mt-4 rounded-(--radius-card) bg-ink px-4 py-8 @xl:px-8">
            <h2 className="text-center text-2xl font-bold text-white">Inscrições</h2>
            <span className="mx-auto mt-3 block h-1 w-12 rounded-full bg-accent-400" aria-hidden />
            <div className="mt-6 rounded-(--radius-card) bg-surface p-5 shadow-(--shadow-overlay)">{registration}</div>
          </section>

          {event.participant_terms ? (
            <Card>
              <CardTitle>Termos e orientações</CardTitle>
              <p className="mt-3 whitespace-pre-line text-sm text-ink">{event.participant_terms}</p>
            </Card>
          ) : null}
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardTitle>Quando</CardTitle>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="text-ink-muted">Início</dt>
                <dd className="font-medium">{formatDate(event.starts_at, tz)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Término</dt>
                <dd className="font-medium">{formatDate(event.ends_at, tz)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle>Onde</CardTitle>
            <div className="mt-3 grid gap-1 text-sm">
              {event.format !== "online" ? (
                <>
                  <p className="font-medium">{event.venue_name}</p>
                  {event.address ? <p className="text-ink-muted">{event.address}</p> : null}
                </>
              ) : null}
              {event.format !== "in_person" ? <p className="text-ink-muted">O link de acesso online é enviado aos inscritos.</p> : null}
            </div>
          </Card>

          {event.contact_email || event.contact_phone ? (
            <Card>
              <CardTitle>Contato do organizador</CardTitle>
              <div className="mt-3 grid gap-1 text-sm">
                {event.contact_email ? (
                  <a href={`mailto:${event.contact_email}`} className="font-medium text-brand-700 hover:underline">
                    {event.contact_email}
                  </a>
                ) : null}
                {event.contact_phone ? <p>{event.contact_phone}</p> : null}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
