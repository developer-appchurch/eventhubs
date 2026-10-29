import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const RATE_LIMITED_MESSAGE = "Muitas tentativas. Aguarde um minuto e tente novamente.";

// Contador no banco (public.rate_limit_hit), por IP e por ação. Falha aberta: sem chave
// secreta configurada ou com o banco fora, o app segue funcionando em vez de travar login.
// shortcut: o IP vem do x-forwarded-for da Vercel; atrás de outro proxy, ajustar a leitura.
export async function allowRequest(action: string, max: number, windowSeconds = 60): Promise<boolean> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 20) return true;
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    const key = `${action}:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
    const { data, error } = await createSupabaseAdminClient(secret).rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
