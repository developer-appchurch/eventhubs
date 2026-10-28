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

// Check-in, pagamentos e relatório são por evento: ficam nas abas do evento. Inscrições também
// têm uma lista geral, com todos os eventos da organização.
export function buildOrgNav(orgSlug: string, showRegistrations: boolean): NavItem[] {
  const base = `/app/${orgSlug}`;
  return [
    { label: "Visão geral", href: base },
    { label: "Eventos", href: `${base}/events` },
    ...(showRegistrations ? [{ label: "Inscrições", href: `${base}/registrations` }] : []),
    { label: "Equipe", href: `${base}/team` },
    { label: "Configurações", href: `${base}/settings` },
  ];
}

const ORG_ICONS: Record<string, IconName> = {
  "Visão geral": "overview",
  Eventos: "calendar",
  Inscrições: "inbox",
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

// Marca, seletor de organização, seções da organização ativa e conta (children), na sidebar.
// No celular só a barra com a marca e o botão Menu fica visível; o resto desliza da esquerda.
// A lista vem do servidor (RLS: só organizações em que o usuário é membro ativo); trocar
// apenas navega para /app/<slug>, e o layout da organização revalida o vínculo no servidor.
export function OrgNav({
  organizations,
  brand,
  children,
}: {
  organizations: NavOrganization[];
  brand: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ orgSlug?: string; eventId?: string }>();
  const [open, setOpen] = useState(false);
  const active = organizations.find((org) => org.slug === params.orgSlug);

  return (
    <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:px-5 lg:py-6">
        {brand}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="painel-menu"
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 items-center gap-2 rounded-(--radius-control) bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15 lg:hidden"
        >
          <Icon name="menu" className="size-4" /> Menu
        </button>
      </div>

      {open ? <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" /> : null}
      {/* invisible quando fechado tira os links da ordem de foco; no desktop é a coluna fixa de sempre. */}
      <div
        id="painel-menu"
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-sidebar shadow-(--shadow-overlay) transition-[translate,visibility] duration-200 ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        } lg:visible lg:static lg:z-auto lg:w-auto lg:max-w-none lg:min-h-0 lg:flex-1 lg:translate-x-0 lg:overflow-visible lg:shadow-none lg:transition-none`}
      >
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:hidden">
          {brand}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 items-center gap-2 rounded-(--radius-control) bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15"
          >
            <Icon name="close" className="size-4" /> Fechar
          </button>
        </div>
        <div className="grid flex-1 content-start gap-3 px-3 pb-4 lg:min-h-0 lg:content-start lg:gap-4 lg:overflow-y-auto">
          <div className="grid gap-1.5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <label htmlFor="org-switcher" className="text-xs font-semibold uppercase tracking-wider text-brand-300">
              Organização
            </label>
            {organizations.length > 1 || !active ? (
              <select
                id="org-switcher"
                value={active?.slug ?? ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setOpen(false);
                  router.push(`/app/${e.target.value}`);
                }}
                // text-base no celular: abaixo de 16px o iPhone amplia a tela ao focar e não volta sozinho.
                className="min-h-10 w-full rounded-(--radius-control) border border-white/20 bg-brand-800 px-3 text-base font-medium text-white lg:text-sm"
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
            <Link href="/onboarding" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded text-sm font-medium text-brand-300 hover:text-white">
              <Icon name="plus" className="size-3.5" /> Nova organização
            </Link>
          </div>

          {active ? (
            <nav aria-label="Seções da organização">
              <ul className="grid gap-0.5">
                {buildOrgNav(active.slug, active.showRegistrations).map((item) => {
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
        {children}
      </div>
    </div>
  );
}
