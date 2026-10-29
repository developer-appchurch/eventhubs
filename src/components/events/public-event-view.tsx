import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Countdown } from "./countdown";
import { WhatsAppLink } from "./whatsapp-link";
import { calendarUrl, mapsUrl } from "@/lib/links";
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

export function soldOutMessage(capacity: number): string {
  return `Vagas encerradas: todas as ${capacity.toLocaleString("pt-BR")} vagas deste evento foram preenchidas.`;
}

// Página pública do evento. Usada pela rota pública e pela pré-visualização (mesmo
// conteúdo, vindo de get_public_event ou get_event_preview). O texto do organizador é
// renderizado como texto puro (React escapa), sem HTML.
export function PublicEventView({ data, registration, ticketsInForm = false }: { data: PublicEventPayload; registration: ReactNode; ticketsInForm?: boolean }) {
  const { event, organization, tickets } = data;
  const availability = publicAvailability(event);
  // Publicado e dentro do prazo, mas sem vagas: o público precisa saber que lotou.
  const soldOut = availability === "open" && event.remaining === 0;
  const notice = soldOut
    ? { tone: "warning" as const, text: soldOutMessage(event.capacity) }
    : AVAILABILITY_MESSAGES[availability];
  const tz = event.timezone;
  const start = formatDate(event.starts_at, tz);
  const end = formatDate(event.ends_at, tz);
  const prices = tickets.map((t) => t.price_cents);
  const [minPrice, maxPrice] = [Math.min(...prices), Math.max(...prices)];
  const price = (cents: number) => (cents === 0 ? "Gratuito" : formatCents(cents));
  const priceRange = minPrice === maxPrice ? price(minPrice) : `${price(minPrice)} a ${formatCents(maxPrice)}`;
  // Só o que foi cadastrado: cada item vazio fica de fora.
  const details: [string, ReactNode][] = [
    ["Data", start === end ? start : `De ${start} a ${end}`],
    ["Formato", FORMAT_LABELS[event.format]],
    ...(event.format !== "online" && event.venue_name ? [["Local", event.venue_name] as [string, ReactNode]] : []),
    ...(event.format !== "online" && event.address
      ? [["Endereço", <span key="a">{event.address} · <a href={mapsUrl(event.address)} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Ver no mapa</a></span>] as [string, ReactNode]]
      : []),
    ...(event.format !== "in_person" ? [["Acesso online", "Link enviado aos inscritos"] as [string, ReactNode]] : []),
    [
      "Vagas",
      event.remaining === 0
        ? `Encerradas · ${event.capacity.toLocaleString("pt-BR")} de ${event.capacity.toLocaleString("pt-BR")} preenchidas`
        : `${event.remaining.toLocaleString("pt-BR")} de ${event.capacity.toLocaleString("pt-BR")} disponíveis`,
    ],
    ...(prices.length ? [["Ingressos", priceRange] as [string, ReactNode]] : []),
    ...(event.contact_email
      ? [["E-mail", <a key="e" href={`mailto:${event.contact_email}`} className="text-brand-700 hover:underline">{event.contact_email}</a>] as [string, ReactNode]]
      : []),
    ...(event.contact_phone ? [["WhatsApp", <WhatsAppLink key="w" phone={event.contact_phone} />] as [string, ReactNode]] : []),
  ];

  return (
    // Medidas pelo contêiner (@), não pela tela: a mesma página cabe no celular da pré-visualização.
    // wrap-anywhere: e-mail ou palavra longa quebra a linha em vez de alargar a página para os lados.
    <article className="@container grid gap-6 wrap-anywhere">
      {/* Capa como fundo do topo, escurecida para o texto branco manter contraste; sem capa, degradê da marca. */}
      <header data-surface="dark" className="bg-hero relative isolate overflow-hidden rounded-(--radius-card) text-center text-white shadow-(--shadow-overlay)">
        {event.cover_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL externa definida pelo organizador; sem otimizador. */}
            <img src={event.cover_image_url} alt="" className="absolute inset-0 -z-20 size-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/60 via-ink/55 to-ink/85" aria-hidden />
          </>
        ) : null}
        <div className="grid justify-items-center gap-4 px-5 py-14 @xl:py-24">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-100 uppercase">{organization.name}</p>
          <h1 className="max-w-3xl text-3xl font-extrabold text-balance @xl:text-5xl">{event.title}</h1>
          <span className="h-1 w-12 rounded-full bg-accent-400" aria-hidden />
          <p className="text-white/90">
            {formatDate(event.starts_at, tz)} · {FORMAT_LABELS[event.format]}
          </p>
          {availability !== "draft" ? (
            <a href={calendarUrl(event, organization.name)} target="_blank" rel="noopener noreferrer" className="text-sm text-white/90 underline underline-offset-4 hover:text-white">
              Adicionar à agenda
            </a>
          ) : null}
          <a
            href="#inscricao"
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-bold tracking-wide text-brand-900 uppercase shadow-(--shadow-overlay) hover:bg-brand-100"
          >
            {availability === "open" && !soldOut ? "Inscreva-se" : "Ver inscrições"}
          </a>
        </div>
        {availability === "open" ? <Countdown to={event.starts_at} /> : null}
      </header>

      <Alert tone={notice.tone}>{notice.text}</Alert>

      <section className="rounded-(--radius-card) border border-brand-100 bg-brand-50 px-4 py-8 @xl:px-8">
        <h2 className="text-center text-2xl font-bold text-brand-900">Detalhes do evento</h2>
        <span className="mx-auto mt-3 block h-1 w-12 rounded-full bg-accent-400" aria-hidden />
        <dl className="mt-6 grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-(--radius-control) bg-surface p-4 shadow-(--shadow-card)">
              <dt className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{label}</dt>
              <dd className="mt-1 font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6">
        {event.description ? (
          <Card>
            <CardTitle>Sobre o evento</CardTitle>
            <p className="mt-3 whitespace-pre-line text-ink">{event.description}</p>
          </Card>
        ) : null}

        {ticketsInForm ? null : (
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
        </Card>
        )}

        <section id="inscricao" data-surface="dark" className="bg-hero scroll-mt-4 rounded-(--radius-card) px-4 py-8 @xl:px-8">
          <h2 className="text-center text-2xl font-bold text-white">Inscrições</h2>
          <span className="mx-auto mt-3 block h-1 w-12 rounded-full bg-accent-400" aria-hidden />
          <div data-surface="light" className="mt-6 rounded-(--radius-card) bg-surface p-5 text-ink shadow-(--shadow-overlay) @xl:p-8">{registration}</div>
        </section>

        {event.participant_terms ? (
          <Card>
            <CardTitle>Termos e orientações</CardTitle>
            <p className="mt-3 whitespace-pre-line text-sm text-ink">{event.participant_terms}</p>
          </Card>
        ) : null}
      </div>
    </article>
  );
}
