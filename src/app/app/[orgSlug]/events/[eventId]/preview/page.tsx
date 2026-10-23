import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewRegistrationForm } from "@/components/events/preview-registration-form";
import { PublicEventView } from "@/components/events/public-event-view";
import { Alert } from "@/components/ui/alert";
import { getEventPreview } from "@/modules/events/queries";

export const metadata: Metadata = { title: "Pré-visualização" };

export default async function EventPreviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const data = await getEventPreview(eventId);
  if (!data) notFound();

  return (
    <div className="grid gap-4">
      <Alert tone="info">Pré-visualização da página pública. O formulário valida as respostas no servidor, mas não cria inscrições.</Alert>
      <div className="rounded-(--radius-card) border border-dashed border-line-strong p-4 sm:p-6">
        <PublicEventView
          data={data}
          registration={data.form ? <PreviewRegistrationForm eventId={data.event.id} fields={data.form.fields} /> : null}
        />
      </div>
    </div>
  );
}
