import Link from "next/link";
import { Icon } from "@/components/ui/icon";
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
  const signOutButton =
    "inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-brand-200 hover:bg-white/10 hover:text-white";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* No celular a sidebar vira uma barra fixa compacta; o menu abre por cima do conteúdo. */}
      <aside data-surface="dark" className="sticky top-0 z-30 bg-sidebar text-white lg:flex lg:h-dvh lg:flex-col">
        <OrgNav
          brand={<Brand href="/app" tone="dark" />}
          organizations={organizations.map(({ role, ...org }) => ({
            ...org,
            showRegistrations: canReadRegistrations(role),
            showFinance: canReadPayments(role),
          }))}
        >
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 lg:block lg:px-5 lg:py-5">
            <Link href="/app/account" className="flex min-w-0 items-center gap-3 rounded-md text-sm font-medium text-white hover:text-brand-200">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold uppercase">
                {userName.trim().charAt(0) || "?"}
              </span>
              <span className="truncate">{userName}</span>
            </Link>
            <form action={signOut} className="shrink-0 lg:mt-2">
              <button type="submit" className={signOutButton}>
                <Icon name="logout" className="size-4" />
                Sair
              </button>
            </form>
          </div>
        </OrgNav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
