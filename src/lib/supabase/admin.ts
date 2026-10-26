import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

// Cliente com a chave secreta: ignora a RLS. Uso restrito ao servidor, só para funções
// liberadas a service_role (envio de e-mail, pagamentos). Toda autorização de usuário é
// feita antes, com a sessão dele.
export function createSupabaseAdminClient(secretKey: string) {
  return createClient(getEnv().NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
