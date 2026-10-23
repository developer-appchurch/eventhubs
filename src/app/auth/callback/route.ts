import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Retorno do login OAuth (Google): troca o código PKCE por sessão.
export async function GET(request: NextRequest) {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/app");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, base));
  }

  return NextResponse.redirect(new URL("/login?error=link_invalido", base));
}
