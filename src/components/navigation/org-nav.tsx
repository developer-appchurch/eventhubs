"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationSummary } from "@/modules/organizations/queries";

export type NavItem = { label: string; href: string };

// Inscrições, check-in, pagamentos e relatório são por evento: ficam nas abas do evento.
export function buildOrgNav(orgSlug: string): NavItem[] {
  const base = `/app/${orgSlug}`;
  return [
    { label: "Visão geral", href: base },
    { label: "Eventos", href: `${base}/events` },
    { label: "Equipe", href: `${base}/team` },
    { label: "Configurações", href: `${base}/settings` },
  ];
}

// Seletor de organização + seções da organização ativa, na sidebar.
// A lista vem do servidor (RLS: só organizações em que o usuário é membro ativo); trocar
// apenas navega para /app/<slug>, e o layout da organização revalida o vínculo no servidor.
export function OrgNav({ organizations }: { organizations: OrganizationSummary[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ orgSlug?: string }>();
  const [open, setOpen] = useState(false);
  const active = organizations.find((org) => org.slug === params.orgSlug);

  return (
    <div className="grid gap-4 px-3 pb-4 lg:flex-1 lg:content-start lg:overflow-y-auto">
      <div className="grid gap-1.5 px-2">
        <label htmlFor="org-switcher" className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Organização
        </label>
        {organizations.length > 1 || !active ? (
          <select
            id="org-switcher"
            value={active?.slug ?? ""}
            onChange={(e) => e.target.value && router.push(`/app/${e.target.value}`)}
            className="min-h-10 w-full rounded-(--radius-control) border border-line-strong bg-surface px-3 text-sm font-medium text-ink"
          >
            {!active ? (
              <option value="" disabled>
                Selecione…
              </option>
            ) : null}
            {organizations.map((org) => (
              <option key={org.id} value={org.slug}>
                {org.name}
              </option>
            ))}
          </select>
        ) : (
          <p id="org-switcher" className="truncate text-sm font-semibold text-ink">
            {active.name}
          </p>
        )}
        <Link href="/onboarding" className="text-sm font-medium text-brand-700 hover:underline">
          + Nova organização
        </Link>
      </div>

      {active ? (
        <nav aria-label="Seções da organização">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-h-10 w-full items-center justify-between rounded-(--radius-control) px-3 text-sm font-medium text-ink hover:bg-brand-50 lg:hidden"
          >
            Menu
            <span aria-hidden="true">{open ? "▲" : "▼"}</span>
          </button>
          <ul className={`${open ? "grid" : "hidden"} gap-0.5 lg:grid`}>
            {buildOrgNav(active.slug).map((item) => {
              const current =
                pathname === item.href || (item.href !== `/app/${active.slug}` && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-medium ${
                      current ? "bg-brand-100 text-brand-900" : "text-ink-muted hover:bg-brand-50 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
