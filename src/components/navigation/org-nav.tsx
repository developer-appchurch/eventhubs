"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href?: string };

// Itens sem href são recursos planejados: aparecem como indisponíveis, nunca como links.
export function buildOrgNav(orgSlug: string): NavItem[] {
  const base = `/app/${orgSlug}`;
  return [
    { label: "Visão geral", href: base },
    { label: "Eventos" },
    { label: "Inscrições" },
    { label: "Participantes" },
    { label: "Check-in" },
    { label: "Relatórios" },
    { label: "Equipe", href: `${base}/team` },
    { label: "Configurações", href: `${base}/settings` },
  ];
}

export function OrgNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const items = buildOrgNav(orgSlug);

  return (
    <nav aria-label="Seções da organização" className="-mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6">
      <ul className="flex gap-1">
        {items.map((item) => {
          if (!item.href) {
            return (
              <li key={item.label} className="shrink-0">
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 px-3 text-sm text-ink-muted/70"
                >
                  {item.label}
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                    Em breve
                  </span>
                </span>
              </li>
            );
          }
          const current = pathname === item.href;
          return (
            <li key={item.label} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${
                  current ? "border-brand-600 text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
