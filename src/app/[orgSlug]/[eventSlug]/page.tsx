import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicEventView, soldOutMessage } from "@/components/events/public-event-view";
import { RegistrationForm } from "@/components/events/registration-form";
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

  return (
    <div className="grid gap-4">
      <Link href={`/${data.organization.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Eventos de {data.organization.name}
      </Link>
      <PublicEventView
        data={data}
        registration={
          publicAvailability(data.event) === "open" && data.form && data.event.remaining !== 0 ? (
            <RegistrationForm
              orgSlug={data.organization.slug}
              eventSlug={data.event.slug}
              // Uma chave por carregamento da página: reenviar o mesmo formulário não duplica a inscrição.
              idempotencyKey={randomUUID()}
              tickets={data.tickets}
              fields={data.form.fields}
              hasTerms={Boolean(data.event.participant_terms)}
              paymentsEnabled={data.payments_enabled}
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
