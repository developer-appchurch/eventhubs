"use server";

import { revalidatePath } from "next/cache";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { parseBankQuestion, type FieldType } from "@/modules/forms/fields";
import { getOrganizationContext } from "@/modules/organizations/queries";

const FORBIDDEN: ActionState = { ok: false, message: "Você não tem permissão para alterar o banco de perguntas." };

async function managedOrg(formData: FormData) {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  return org && canManageEvents(org.role) ? org : null;
}

export async function saveBankQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrg(formData);
  if (!org) return FORBIDDEN;

  const min = text(formData, "min");
  const max = text(formData, "max");
  const parsed = parseBankQuestion({
    label: text(formData, "label"),
    type: text(formData, "type") as FieldType,
    required: formData.get("required") === "on",
    always_on: formData.get("always_on") === "on",
    options: text(formData, "options").split("\n").map((o) => o.trim()).filter(Boolean),
    validation: { min: min === "" ? undefined : Number(min), max: max === "" ? undefined : Number(max) },
    help_text: text(formData, "help_text"),
    placeholder: text(formData, "placeholder"),
  });
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const supabase = await createSupabaseServerClient();
  const id = text(formData, "questionId");
  const { data, error } = isUuid(id)
    ? await supabase.from("question_bank").update(parsed.data).eq("id", id).eq("organization_id", org.id).select("id")
    : await supabase.from("question_bank").insert({ ...parsed.data, organization_id: org.id }).select("id");
  if (error) return mapDatabaseError(error);
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/${org.slug}`, "layout");
  return { ok: true, message: isUuid(id) ? "Pergunta atualizada." : "Pergunta adicionada ao banco." };
}

// Apagar do banco não mexe nos formulários que já usam a pergunta (o campo foi copiado).
export async function deleteBankQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrg(formData);
  const id = text(formData, "questionId");
  if (!org || !isUuid(id)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("question_bank").delete().eq("id", id).eq("organization_id", org.id).select("id");
  if (error) return mapDatabaseError(error);
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/${org.slug}`, "layout");
  return { ok: true, message: "Pergunta removida do banco." };
}
