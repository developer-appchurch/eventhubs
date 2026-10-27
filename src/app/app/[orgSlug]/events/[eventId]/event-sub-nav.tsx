"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { eventSections } from "@/components/navigation/org-nav";

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
