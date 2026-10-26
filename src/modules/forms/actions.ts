"use server";

import { revalidatePath } from "next/cache";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEvent, getEventPreview, isUuid } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { answersFromFormData, validateAnswers } from "./answers";
import { listBankQuestions } from "@/modules/question-bank/queries";
import { bankFieldKey, bankQuestionFromField, formDefinitionSchema, missingAlwaysOn, parseBankQuestion, type FormField } from "./fields";

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

  const missing = missingAlwaysOn(parsed.data, await listBankQuestions(org.id));
  if (missing.length) return { ok: false, message: `A pergunta "${missing[0].label}" é obrigatória em todos os eventos.` };

  const supabase = await createSupabaseServerClient();

  // Perguntas criadas aqui e marcadas "Salvar no banco": entram no banco antes do formulário,
  // e o campo passa a usar a chave da pergunta criada (o id do navegador é só provisório).
  let newBankIds: unknown;
  try {
    newBankIds = JSON.parse(text(formData, "newBankIds") || "[]");
  } catch {
    newBankIds = [];
  }
  const fields = [...parsed.data];
  for (const tempId of Array.isArray(newBankIds) ? newBankIds.slice(0, 60) : []) {
    const index = typeof tempId === "string" && isUuid(tempId) ? fields.findIndex((f) => f.key === bankFieldKey(tempId)) : -1;
    if (index < 0) continue;
    const question = parseBankQuestion(bankQuestionFromField(fields[index]));
    if (!question.ok) return { ok: false, message: question.message };
    const { data: row, error } = await supabase.from("question_bank").insert({ ...question.data, organization_id: org.id }).select("id").single();
    if (error) return mapDatabaseError(error);
    fields[index] = { ...fields[index], key: bankFieldKey(row.id) };
  }

  const { data, error } = await supabase.rpc("save_event_form", { p_event_id: event.id, p_fields: fields });
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
