import type { ReactNode } from "react";
import { Brand } from "./brand";

// Moldura comum das telas de autenticação: uma coluna centralizada, legível em celular.
export function AuthPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8 sm:px-6">
      <div className="pb-8">
        <Brand />
      </div>
      <main className="grid gap-6 rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card) sm:p-8">
        <header className="grid gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
