import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/modules/auth/actions";
import type { OrganizationSummary } from "@/modules/organizations/queries";
import { Brand } from "./brand";

// Navegação global do painel: organizações do usuário, conta e saída.
export function AppShell({
  children,
  organizations,
  userName,
  activeSlug,
}: {
  children: React.ReactNode;
  organizations: OrganizationSummary[];
  userName: string;
  activeSlug?: string;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-5 lg:py-6">
          <Brand href="/app" />
        </div>

        <nav aria-label="Organizações" className="overflow-x-auto px-2 pb-2 lg:flex-1 lg:px-3 lg:pb-0">
          <p className="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted lg:block">
            Organizações
          </p>
          <ul className="flex gap-1 lg:grid lg:gap-0.5">
            {organizations.map((org) => {
              const active = org.slug === activeSlug;
              return (
                <li key={org.id} className="shrink-0">
                  <Link
                    href={`/app/${org.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-medium ${
                      active ? "bg-brand-100 text-brand-900" : "text-ink-muted hover:bg-brand-50 hover:text-ink"
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                  </Link>
                </li>
              );
            })}
            <li className="shrink-0">
              <Link
                href="/onboarding"
                className="flex min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                + Nova organização
              </Link>
            </li>
          </ul>
        </nav>

        <div className="hidden border-t border-line px-5 py-5 lg:block">
          <Link href="/app/account" className="block truncate text-sm font-medium text-ink hover:underline">
            {userName}
          </Link>
          <form action={signOut} className="mt-2">
            <Button type="submit" variant="ghost" className="min-h-9 px-0 text-ink-muted hover:bg-transparent hover:text-ink">
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <Link href="/app/account" className="truncate text-sm font-medium text-ink-muted hover:text-ink">
            {userName}
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="min-h-9 px-2 text-sm text-ink-muted hover:bg-transparent hover:text-ink">
              Sair
            </Button>
          </form>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
