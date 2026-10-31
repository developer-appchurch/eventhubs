"use client";

import Link from "@/components/navigation/intent-link";
import { usePathname } from "next/navigation";
import { eventSections } from "@/components/navigation/org-nav";
import { buttonClass } from "@/components/ui/button";

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
