import type { Metadata } from "next";
import { AuthPage } from "@/components/navigation/auth-page";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <AuthPage title="Escolha uma nova senha" description="Use pelo menos 8 caracteres.">
      <ResetPasswordForm />
    </AuthPage>
  );
}
