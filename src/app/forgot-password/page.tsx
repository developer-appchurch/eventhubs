import type { Metadata } from "next";
import Link from "@/components/navigation/intent-link";
import { AuthPage } from "@/components/navigation/auth-page";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthPage title="Recuperar senha" description="Enviaremos um link para você escolher uma nova senha.">
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm font-semibold text-brand-700 hover:underline">
        Voltar para entrar
      </Link>
    </AuthPage>
  );
}
