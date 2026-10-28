"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { eventSections } from "@/components/navigation/org-nav";
import { buttonClass } from "@/components/ui/button";

export function EventSubNav({ base, showRegistrations, showFinance }: { base: string; showRegistrations: boolean; showFinance: boolean }) {
  const pathname = usePathname();
  const items = eventSections(base, showRegistrations, showFinance);
  return (
    // No desktop o submenu da barra lateral já faz esse papel; as abas ficam só no celular.
    <nav aria-label="Seções do evento" className="-mx-4 overflow-x-auto px-4 lg:hidden">
      <ul className="flex gap-2">
        {items.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ${
                  current ? "bg-brand-600 text-white" : "bg-surface-muted text-ink hover:bg-brand-50"
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

// Voltar/Avançar entre as seções do evento, na mesma ordem do menu lateral.
export function EventStepNav({ base, showRegistrations, showFinance }: { base: string; showRegistrations: boolean; showFinance: boolean }) {
  const pathname = usePathname();
  const items = eventSections(base, showRegistrations, showFinance);
  const index = items.findIndex((item) => item.href === pathname);
  if (index === -1) return null;
  const prev = items[index - 1];
  const next = items[index + 1];
  return (
    <nav aria-label="Etapas do evento" className="flex flex-wrap justify-between gap-3">
      {prev ? (
        <Link href={prev.href} className={buttonClass("secondary")}>
          ← Voltar: {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className={buttonClass("primary")}>
          Avançar: {next.label} →
        </Link>
      ) : null}
    </nav>
  );
}
