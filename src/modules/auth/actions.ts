"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { ActionState } from "@/lib/errors";
import { allowRequest, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

function firstErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  if (!(await allowRequest("signin", 10))) return { ok: false, message: RATE_LIMITED_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mensagem genérica: não revela se o e-mail existe.
    return { ok: false, message: "E-mail ou senha inválidos." };
  }

  redirect(safeNextPath(text(formData, "next")));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  if (!(await allowRequest("signup", 5))) return { ok: false, message: RATE_LIMITED_MESSAGE };

  const env = getEnv();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      // Modelos de e-mail padrão do Supabase: o link volta com ?code= (PKCE), trocado por sessão em /auth/callback.
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });

  if (error && error.status === 422 && /password/i.test(error.message)) {
    return { ok: false, fieldErrors: { password: "Escolha uma senha mais forte." } };
  }

  // Com confirmação de e-mail ativa não há sessão ainda. A mensagem é a mesma para contas
  // novas e existentes, para não revelar cadastros.
  if (data.session) redirect("/onboarding");

  return {
    ok: true,
    message: "Enviamos um link de confirmação para o seu e-mail. Abra a mensagem para ativar a conta.",
  };
}

// Login com Google (OAuth por PKCE). Requer o provedor configurado no Supabase.
export async function signInWithGoogle(): Promise<void> {
  const env = getEnv();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/app` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  if (!(await allowRequest("reset", 5))) return { ok: false, message: RATE_LIMITED_MESSAGE };

  const env = getEnv();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  return {
    ok: true,
    message: "Se existir uma conta com este e-mail, enviamos as instruções para redefinir a senha.",
  };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, message: "O link expirou. Solicite uma nova redefinição de senha." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: "Não foi possível alterar a senha. Tente novamente." };

  redirect("/app");
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({ fullName: text(formData, "fullName") });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  // A política RLS restringe o UPDATE ao próprio perfil; o id vem da sessão, não do formulário.
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", userData.user.id)
    .select("id");

  if (error || !data?.length) return { ok: false, message: "Não foi possível salvar o perfil." };
  return { ok: true, message: "Perfil atualizado." };
}

