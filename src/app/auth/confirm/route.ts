import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set<EmailOtpType>(["signup", "recovery", "email", "invite", "email_change"]);

// Confirma o link enviado por e-mail (token_hash). O redirecionamento usa a URL pública
// configurada, não o cabeçalho Host da requisição.
export async function GET(request: NextRequest) {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), "/app");

  if (tokenHash && type && ALLOWED_TYPES.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, base));
  }

  return NextResponse.redirect(new URL("/login?error=link_invalido", base));
}
