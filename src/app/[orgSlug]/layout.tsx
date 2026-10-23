import { Brand } from "@/components/navigation/brand";

// Moldura das páginas públicas da organização (sem sessão obrigatória).
export default function PublicOrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Brand />
      </header>
      <main id="conteudo" className="flex-1 pb-16">
        {children}
      </main>
    </div>
  );
}
