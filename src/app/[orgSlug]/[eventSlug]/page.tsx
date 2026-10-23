import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicEventView } from "@/components/events/public-event-view";
import { getPublicEvent } from "@/modules/events/queries";

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
  if (!data) notFound();

  return (
    <div className="grid gap-4">
      <Link href={`/${data.organization.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← Eventos de {data.organization.name}
      </Link>
      <PublicEventView
        data={data}
        registration={
          // shortcut: inscrição online entra na Fase 3; até lá a página informa e não exibe botão sem ação.
          <p className="text-sm text-ink-muted">
            As inscrições online serão abertas em breve. Em caso de dúvida, fale com o organizador pelo contato desta página.
          </p>
        }
      />
    </div>
  );
}
