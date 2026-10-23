import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BankQuestion } from "@/modules/forms/fields";

export async function listBankQuestions(organizationId: string): Promise<BankQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("question_bank")
    .select("id, label, type, required, always_on, options, validation, help_text, placeholder")
    .eq("organization_id", organizationId)
    .order("always_on", { ascending: false })
    .order("label");

  if (error) throw new Error("Não foi possível carregar o banco de perguntas.");
  return (data ?? []) as BankQuestion[];
}
