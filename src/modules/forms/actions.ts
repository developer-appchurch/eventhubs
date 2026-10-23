"use server";

import { revalidatePath } from "next/cache";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEvent, getEventPreview, isUuid } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { answersFromFormData, validateAnswers } from "./answers";
import { formDefinitionSchema, type FormField } from "./fields";

export async function saveEventForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  const event = org && canManageEvents(org.role) ? await getEvent(org.id, text(formData, "eventId")) : null;
  if (!org || !event) return { ok: false, message: "Você não tem permissão para alterar este formulário." };

  let json: unknown;
  try {
    json = JSON.parse(text(formData, "fields"));
  } catch {
    return { ok: false, message: "O formulário enviado é inválido." };
  }
  const parsed = formDefinitionSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revise os campos do formulário." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_event_form", { p_event_id: event.id, p_fields: parsed.data });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events/${event.id}`, "layout");
  return { ok: true, message: `Formulário salvo (versão ${data}).` };
}

// Pré-visualização: valida respostas no servidor exatamente como a inscrição fará, sem gravar.
export async function testFormAnswers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = text(formData, "eventId");
  const preview = isUuid(eventId) ? await getEventPreview(eventId) : null;
  if (!preview?.form) return { ok: false, message: "Pré-visualização indisponível." };

  const fields = preview.form.fields.map((f) => ({ ...f, is_active: true })) as FormField[];
  const result = validateAnswers(fields, answersFromFormData(fields, formData));
  if (!result.ok) return { ok: false, message: "Há campos para corrigir.", fieldErrors: result.errors };
  return { ok: true, message: "Respostas válidas. Nada foi gravado: isto é só uma pré-visualização." };
}
