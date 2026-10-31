import type { Metadata } from "next";
import Link from "@/components/navigation/intent-link";
import { Alert } from "@/components/ui/alert";
import { AuthPage } from "@/components/navigation/auth-page";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthPage title="Entrar" description="Acesse suas organizações e eventos.">
      {params.error === "link_invalido" ? (
        <Alert tone="danger">O link expirou ou já foi usado. Solicite um novo.</Alert>
      ) : null}
      {params.error === "oauth" ? (
        <Alert tone="danger">Não foi possível entrar com Google. Tente novamente ou use e-mail e senha.</Alert>
      ) : null}
      <LoginForm next={safeNextPath(params.next)} />
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="font-semibold text-brand-700 hover:underline">
          Esqueci minha senha
        </Link>
        <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
          Criar conta
        </Link>
      </div>
    </AuthPage>
  );
}
