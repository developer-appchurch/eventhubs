import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { FORMAT_LABELS } from "@/modules/events/status";
import { getRegistrationByToken, REGISTRATION_STATUS_LABELS } from "@/modules/registrations/queries";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string; token: string }> };

// O link contém um segredo: não indexar e não vazar como referer.
export const metadata: Metadata = { title: "Sua inscrição", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RegistrationStatusPage({ params }: Props) {
  const { orgSlug, eventSlug, token } = await params;
  const registration = await getRegistrationByToken(token);
  if (!registration || registration.organization.slug !== orgSlug.toLowerCase() || registration.event.slug !== eventSlug.toLowerCase()) {
    notFound();
  }

  const { event } = registration;
  const tz = event.timezone;
  const confirmed = registration.status === "confirmed";
  const cancelledEvent = event.status === "cancelled";

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href={`/${registration.organization.slug}/${event.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← {event.title}
      </Link>

      <header className="grid gap-2">
        <p className="text-sm font-semibold text-brand-700">{registration.organization.name}</p>
        <h1 className="text-3xl font-bold">Sua inscrição</h1>
      </header>

      {cancelledEvent ? (
        <Alert tone="danger">Este evento foi cancelado pelo organizador.</Alert>
      ) : confirmed ? (
        <Alert tone="success">Inscrição confirmada. Guarde este link: é por ele que você consulta sua inscrição.</Alert>
      ) : (
        <Alert tone="warning">Situação da inscrição: {REGISTRATION_STATUS_LABELS[registration.status]}.</Alert>
      )}

      <Card>
        <CardTitle>Dados da inscrição</CardTitle>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Situação</dt>
            <dd className="font-medium">{REGISTRATION_STATUS_LABELS[registration.status]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Ingresso</dt>
            <dd className="font-medium">{registration.ticket.name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Participante</dt>
            <dd className="font-medium">{registration.attendee_name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">E-mail</dt>
            <dd className="font-medium break-all">{registration.attendee_email}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Feita em</dt>
            <dd className="font-medium">{formatDateTime(registration.created_at, tz)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Evento</CardTitle>
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">Quando</dt>
            <dd className="font-medium">
              {formatDateTime(event.starts_at, tz)} até {formatDateTime(event.ends_at, tz)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Formato</dt>
            <dd className="font-medium">{FORMAT_LABELS[event.format]}</dd>
          </div>
          {event.format !== "online" ? (
            <div>
              <dt className="text-ink-muted">Local</dt>
              <dd className="font-medium">
                {event.venue_name}
                {event.address ? <span className="block font-normal text-ink-muted">{event.address}</span> : null}
              </dd>
            </div>
          ) : null}
          {event.format !== "in_person" && event.online_url ? (
            <div>
              <dt className="text-ink-muted">Acesso online</dt>
              <dd>
                <a href={event.online_url} rel="noopener noreferrer" target="_blank" className="font-medium text-brand-700 break-all hover:underline">
                  {event.online_url}
                </a>
              </dd>
            </div>
          ) : null}
          {event.contact_email || event.contact_phone ? (
            <div>
              <dt className="text-ink-muted">Contato do organizador</dt>
              <dd className="font-medium">{[event.contact_email, event.contact_phone].filter(Boolean).join(" · ")}</dd>
            </div>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}
