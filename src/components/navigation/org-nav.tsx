"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import type { OrganizationSummary } from "@/modules/organizations/queries";

export type NavItem = { label: string; href: string };
export type NavOrganization = OrganizationSummary & { showRegistrations: boolean; showFinance: boolean };

// Seções de um evento: abas na tela do evento e submenu de Eventos na sidebar.
export function eventSections(base: string, showRegistrations: boolean, showFinance: boolean): NavItem[] {
  return [
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
}

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

const ORG_ICONS: Record<string, IconName> = {
  "Visão geral": "overview",
  Eventos: "calendar",
  Equipe: "users",
  Configurações: "settings",
};

const EVENT_ICONS: Record<string, IconName> = {
  Detalhes: "info",
  Ingressos: "ticket",
  Formulário: "form",
  "Pré-visualizar": "eye",
  Inscrições: "users",
  "Check-in": "qr",
  Pagamentos: "card",
  Relatório: "chart",
};

// Seletor de organização + seções da organização ativa, na sidebar.
// A lista vem do servidor (RLS: só organizações em que o usuário é membro ativo); trocar
// apenas navega para /app/<slug>, e o layout da organização revalida o vínculo no servidor.
export function OrgNav({ organizations }: { organizations: NavOrganization[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ orgSlug?: string; eventId?: string }>();
  const [open, setOpen] = useState(false);
  const active = organizations.find((org) => org.slug === params.orgSlug);

  return (
    <div className="grid gap-4 px-3 pb-4 lg:flex-1 lg:content-start lg:overflow-y-auto">
      <div className="grid gap-1.5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <label htmlFor="org-switcher" className="text-xs font-semibold uppercase tracking-wider text-brand-300">
          Organização
        </label>
        {organizations.length > 1 || !active ? (
          <select
            id="org-switcher"
            value={active?.slug ?? ""}
            onChange={(e) => e.target.value && router.push(`/app/${e.target.value}`)}
            className="min-h-10 w-full rounded-(--radius-control) border border-white/20 bg-brand-800 px-3 text-sm font-medium text-white"
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
          <p id="org-switcher" className="flex items-center gap-2 truncate text-sm font-semibold text-white">
            <Icon name="building" className="size-4 text-brand-300" />
            <span className="truncate">{active.name}</span>
          </p>
        )}
        <Link href="/onboarding" className="inline-flex items-center gap-1 rounded text-sm font-medium text-brand-300 hover:text-white">
          <Icon name="plus" className="size-3.5" /> Nova organização
        </Link>
      </div>

      {active ? (
        <nav aria-label="Seções da organização">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center justify-between rounded-(--radius-control) bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10 lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <Icon name={open ? "close" : "menu"} className="size-4" /> Menu
            </span>
            <Icon name="chevron" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <ul className={`${open ? "grid" : "hidden"} mt-1 gap-0.5 lg:mt-0 lg:grid`}>
            {buildOrgNav(active.slug).map((item) => {
              const current =
                pathname === item.href || (item.href !== `/app/${active.slug}` && pathname.startsWith(`${item.href}/`));
              // Dentro de um evento o destaque fica no submenu; o item pai só fica em negrito.
              const inEvent = item.label === "Eventos" && Boolean(params.eventId);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-(--radius-control) px-3 text-sm font-medium transition-colors lg:min-h-10 ${
                      inEvent
                        ? "font-semibold text-white hover:bg-white/10"
                        : current
                          ? "bg-brand-600 text-white shadow-(--shadow-glow)"
                          : "text-brand-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon name={ORG_ICONS[item.label] ?? "overview"} className="size-[1.125rem]" />
                    {item.label}
                  </Link>
                  {item.label === "Eventos" && params.eventId ? (
                    <ul aria-label="Seções do evento" className="mt-0.5 ml-5 grid gap-0.5 border-l border-white/15">
                      {eventSections(`${item.href}/${params.eventId}`, active.showRegistrations, active.showFinance).map((sub) => (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            onClick={() => setOpen(false)}
                            aria-current={pathname === sub.href ? "page" : undefined}
                            className={`-ml-px flex min-h-10 items-center gap-2.5 border-l-2 pr-3 pl-3 text-sm transition-colors lg:min-h-9 ${
                              pathname === sub.href
                                ? "border-brand-500 bg-white/10 font-semibold text-white"
                                : "border-transparent text-brand-200 hover:border-white/40 hover:text-white"
                            }`}
                          >
                            <Icon name={EVENT_ICONS[sub.label] ?? "info"} className="size-4" />
                            {sub.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
