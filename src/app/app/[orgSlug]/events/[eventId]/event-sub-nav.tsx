"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function EventSubNav({ base, showRegistrations, showFinance }: { base: string; showRegistrations: boolean; showFinance: boolean }) {
  const pathname = usePathname();
  const items = [
    { label: "Detalhes", href: base },
    { label: "Ingressos", href: `${base}/tickets` },
    { label: "Formulário", href: `${base}/form` },
    { label: "Pré-visualizar", href: `${base}/preview` },
    ...(showRegistrations
      ? [
          { label: "Inscrições", href: `${base}/registrations` },
          { label: "Check-in", href: `${base}/checkin` },
        ]
      : []),
    ...(showFinance ? [{ label: "Pagamentos", href: `${base}/payments` }, { label: "Relatório", href: `${base}/report` }] : []),
  ];
  return (
    <nav aria-label="Seções do evento">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
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
