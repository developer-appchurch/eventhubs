import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Perfil do próprio usuário (RLS restringe a leitura ao dono da sessão).
export const getOwnProfile = cache(async function getOwnProfile(): Promise<{ full_name: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("full_name").maybeSingle();
  if (error) return null;
  return data;
});
