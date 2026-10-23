import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/navigation/auth-page";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <AuthPage title="Criar conta" description="Leva menos de um minuto. Depois você cria sua organização.">
      <SignupForm />
      <p className="text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthPage>
  );
}
