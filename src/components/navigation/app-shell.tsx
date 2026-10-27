import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/modules/auth/actions";
import type { OrganizationContext } from "@/modules/organizations/queries";
import { canReadPayments } from "@/modules/payments/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { Brand } from "./brand";
import { OrgNav } from "./org-nav";

// Navegação global do painel: seletor de organização, seções da organização ativa, conta e saída.
export function AppShell({
  children,
  organizations,
  userName,
}: {
  children: React.ReactNode;
  organizations: OrganizationContext[];
  userName: string;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-5 lg:py-6">
          <Brand href="/app" />
        </div>

        <OrgNav
          organizations={organizations.map(({ role, ...org }) => ({
            ...org,
            showRegistrations: canReadRegistrations(role),
            showFinance: canReadPayments(role),
          }))}
        />

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
