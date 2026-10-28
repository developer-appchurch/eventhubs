import type { ReactNode } from "react";
import { Brand } from "./brand";

// Moldura comum das telas de autenticação: fundo roxo profundo, cartão claro centralizado, legível em celular.
export function AuthPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div data-surface="dark" className="bg-hero relative isolate min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 -z-10 size-[28rem] rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 -z-10 size-[16rem] rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 -z-10 size-[26rem] rounded-full bg-brand-600/20 blur-3xl" />
      <div id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8 sm:px-6">
        <div className="pb-8">
          <Brand tone="dark" />
        </div>
        <main data-surface="light" className="grid gap-6 rounded-2xl border border-white/10 bg-surface p-6 text-ink shadow-(--shadow-overlay) sm:p-8">
          <header className="grid gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
