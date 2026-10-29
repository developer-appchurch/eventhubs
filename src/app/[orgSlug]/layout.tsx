import { Brand } from "@/components/navigation/brand";

// Moldura das páginas públicas da organização (sem sessão obrigatória).
export default function PublicOrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div data-surface="dark" className="bg-brand-900">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Brand tone="dark" />
        </header>
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 sm:px-6">
        <main id="conteudo" className="pb-16">
          {children}
        </main>
      </div>
      <footer className="border-t border-line py-5 text-center text-sm text-ink-muted">Página criada com EventHub</footer>
    </div>
  );
}
