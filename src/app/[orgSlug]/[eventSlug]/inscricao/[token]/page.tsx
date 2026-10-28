import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Alert } from "@/components/ui/alert";
import { PayButton } from "@/components/events/pay-button";
import { PixPayment } from "@/components/events/pix-payment";
import { RefreshWhilePending } from "@/components/events/refresh-while-pending";
import { WhatsAppLink } from "@/components/events/whatsapp-link";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCents, formatDate, formatDateTime } from "@/lib/datetime";
import { getEnv } from "@/lib/env";
import { checkinUrl } from "@/modules/checkins/code";
import { FORMAT_LABELS } from "@/modules/events/status";
import { getRegistrationByToken, REGISTRATION_STATUS_LABELS } from "@/modules/registrations/queries";
import { redirectIfOrganizationRenamed } from "@/modules/organizations/queries";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string; token: string }> };

// O link contém um segredo: não indexar e não vazar como referer.
export const metadata: Metadata = { title: "Sua inscrição", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RegistrationStatusPage({ params }: Props) {
  const { orgSlug, eventSlug, token } = await params;
  const registration = await getRegistrationByToken(token);
  if (!registration || registration.organization.slug !== orgSlug.toLowerCase() || registration.event.slug !== eventSlug.toLowerCase()) {
    await redirectIfOrganizationRenamed(orgSlug);
    notFound();
  }

  const { event } = registration;
  const tz = event.timezone;
  const confirmed = registration.status === "confirmed";
  const cancelledEvent = event.status === "cancelled";
  // O QR leva só o código opaco do check-in, nunca o token desta página nem dados pessoais.
  const qr = registration.checkin_code
    ? await QRCode.toString(checkinUrl(getEnv().NEXT_PUBLIC_APP_URL, registration.organization.slug, event.id, registration.checkin_code), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      })
    : null;

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
        <Alert tone="success">
          {registration.price_cents > 0 ? "Pagamento aprovado! " : null}Sua inscrição em {event.title} está confirmada. Enviamos o QR Code do
          check-in para {registration.attendee_email}. Guarde este link: é por ele que você consulta sua inscrição.
        </Alert>
      ) : registration.status === "pending_payment" && registration.expires_at ? (
        <Card>
          <CardTitle>Pagamento pendente</CardTitle>
          <p className="mt-1 mb-4 text-sm text-ink-muted">
            Sua vaga está reservada até {formatDateTime(registration.expires_at, tz)}. Pague {formatCents(registration.price_cents)} para confirmar a
            inscrição. Se você já pagou, a confirmação aparece aqui assim que o Mercado Pago aprovar.
          </p>
          <div className="grid gap-3">
            <PixPayment token={token} />
            <PayButton token={token} />
          </div>
        </Card>
      ) : registration.status === "expired" ? (
        <Alert tone="warning">A reserva expirou sem pagamento aprovado e a vaga foi liberada. Faça uma nova inscrição, se ainda houver vagas.</Alert>
      ) : (
        <Alert tone="warning">Situação da inscrição: {REGISTRATION_STATUS_LABELS[registration.status]}.</Alert>
      )}

      {qr ? (
        <Card>
          <CardTitle>QR Code do check-in</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">Apresente este código na entrada do evento. Ele é único e vale para uma entrada.</p>
          {/* SVG gerado no servidor pela biblioteca, sem conteúdo do usuário. */}
          <div role="img" aria-label="QR Code do check-in" className="mx-auto mt-4 w-56 max-w-full bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
        </Card>
      ) : null}

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
              {formatDate(event.starts_at, tz)} até {formatDate(event.ends_at, tz)}
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
              <dd className="flex flex-wrap items-center gap-x-2 font-medium">
                {event.contact_email}
                {event.contact_email && event.contact_phone ? " · " : null}
                {event.contact_phone ? <WhatsAppLink phone={event.contact_phone} /> : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>
      {registration.status === "pending_payment" && registration.expires_at && !cancelledEvent ? <RefreshWhilePending until={registration.expires_at} /> : null}
    </div>
  );
}
