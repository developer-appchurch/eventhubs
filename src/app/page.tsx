import Link from "next/link";
import { Brand } from "@/components/navigation/brand";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div id="conteudo" className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Brand />
        <nav aria-label="Conta" className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-ink-muted hover:text-ink">
            Entrar
          </Link>
          <Link href="/signup">
            <Button className="min-h-10 px-4">Criar conta</Button>
          </Link>
        </nav>
      </header>

      <main className="grid flex-1 content-center gap-6 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Eventos e inscrições</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Organize eventos, inscrições e presença sem planilhas paralelas.
        </h1>
        <p className="max-w-2xl text-lg text-ink-muted">
          Crie sua organização, publique eventos e acompanhe cada participante do primeiro convite
          à entrada no local. Feito para igrejas, congressos, empresas e produtores de cursos.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/signup">
            <Button className="w-full sm:w-auto">Começar gratuitamente</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" className="w-full sm:w-auto">
              Já tenho conta
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-sm text-ink-muted">
        EventHubs · Dados pessoais tratados conforme a LGPD. Consulte a política de privacidade na publicação do serviço.
      </footer>
    </div>
  );
}
