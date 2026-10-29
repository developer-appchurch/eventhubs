import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getRegistrationByToken, registrationCookie } from "@/modules/registrations/queries";
import { PublicEventView, soldOutMessage } from "@/components/events/public-event-view";
import { RegistrationForm } from "@/components/events/registration-form";
import { StickyCta } from "@/components/events/sticky-cta";
import { formatCents } from "@/lib/datetime";
import { getPublicEvent } from "@/modules/events/queries";
import { publicAvailability } from "@/modules/events/status";
import { redirectIfOrganizationRenamed } from "@/modules/organizations/queries";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, eventSlug } = await params;
  const data = await getPublicEvent(orgSlug, eventSlug);
  if (!data) return { title: "Evento não encontrado" };
  return {
    title: data.event.title,
    description: data.event.description.slice(0, 160) || `Evento de ${data.organization.name}`,
    // A capa vira a imagem do link compartilhado (WhatsApp, redes sociais).
    openGraph: { title: data.event.title, type: "website", images: data.event.cover_image_url ? [data.event.cover_image_url] : undefined },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  // Rascunho e inexistente respondem igual (404): a função do banco não devolve rascunhos.
  const data = await getPublicEvent(orgSlug, eventSlug);
  if (!data) {
    await redirectIfOrganizationRenamed(orgSlug);
    notFound();
  }

  // Quem já se inscreveu neste aparelho volta para a própria inscrição em vez de criar outra.
  const token = (await cookies()).get(registrationCookie(data.event.id))?.value ?? "";
  const mine = token ? await getRegistrationByToken(token).catch(() => null) : null;
  const ownStatus = mine?.event.id === data.event.id ? mine.status : null;
  const formShown = publicAvailability(data.event) === "open" && Boolean(data.form) && data.event.remaining !== 0;
  const minPrice = data.tickets.length ? Math.min(...data.tickets.map((t) => t.price_cents)) : null;
  const stickyLabel = minPrice === null || minPrice === 0 ? "Inscreva-se" : `Inscreva-se · a partir de ${formatCents(minPrice)}`;
  const ownUrl = `/${data.organization.slug}/${data.event.slug}/inscricao/${token}`;

  return (
    <div className="grid gap-4">
      <Link href={`/${data.organization.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Eventos de {data.organization.name}
      </Link>
      {ownStatus === "pending_payment" || ownStatus === "confirmed" ? (
        <Card>
          <CardTitle>{ownStatus === "pending_payment" ? "Sua inscrição está aguardando pagamento" : "Você já está inscrito neste evento"}</CardTitle>
          <p className="mt-1 mb-4 text-sm text-ink-muted">
            {ownStatus === "pending_payment"
              ? "Sua vaga continua reservada por enquanto. Conclua o pagamento para confirmar a inscrição."
              : "Veja os dados da inscrição e o QR Code do check-in."}
          </p>
          <Link href={ownUrl} className={buttonClass()}>
            {ownStatus === "pending_payment" ? "Continuar o pagamento" : "Ver minha inscrição"}
          </Link>
        </Card>
      ) : null}
      {formShown ? <StickyCta label={stickyLabel} /> : null}
      <PublicEventView
        data={data}
        ticketsInForm={formShown}
        registration={
          formShown && data.form ? (
            <RegistrationForm
              orgSlug={data.organization.slug}
              eventSlug={data.event.slug}
              // Uma chave por carregamento da página: reenviar o mesmo formulário não duplica a inscrição.
              idempotencyKey={randomUUID()}
              tickets={data.tickets}
              fields={data.form.fields}
              hasTerms={Boolean(data.event.participant_terms)}
              paymentsEnabled={data.payments_enabled}
              timezone={data.event.timezone}
            />
          ) : data.event.remaining === 0 ? (
            <div className="grid gap-1 text-center">
              <p className="text-lg font-bold text-brand-900">Vagas encerradas</p>
              <p className="text-sm text-ink-muted">{soldOutMessage(data.event.capacity)} Não é possível fazer novas inscrições.</p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">A inscrição online não está disponível agora. Veja a situação do evento acima.</p>
          )
        }
      />
    </div>
  );
}
