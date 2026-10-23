import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent, getFormVersion, listFormFields } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { FIELD_TYPE_LABELS } from "@/modules/forms/fields";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { FormBuilder } from "./form-builder";

export const metadata: Metadata = { title: "Formulário de inscrição" };

export default async function EventFormPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event) notFound();

  const [fields, version] = await Promise.all([listFormFields(event.id), getFormVersion(event.id)]);
  const editable = canManageEvents(org.role) && event.status !== "ended" && event.status !== "cancelled";

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        Versão atual: {version}. Cada alteração salva gera uma nova versão; inscrições guardam a versão que responderam, para que
        respostas antigas mantenham o significado.
      </p>
      {editable ? (
        <FormBuilder key={version} organizationSlug={org.slug} eventId={event.id} initialFields={fields} />
      ) : (
        <ol className="grid gap-2 text-sm">
          {fields.map((f) => (
            <li key={f.key}>
              {f.label} · {FIELD_TYPE_LABELS[f.type]} {f.required ? "· obrigatório" : ""} {f.is_active ? "" : "· inativo"}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
