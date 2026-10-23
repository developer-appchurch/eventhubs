import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABELS } from "@/modules/organizations/roles";
import { listMyOrganizations } from "@/modules/organizations/queries";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Painel" };

export default async function AppIndexPage() {
  const organizations = await listMyOrganizations();
  if (organizations.length === 0) redirect("/onboarding");
  if (organizations.length === 1) redirect(`/app/${organizations[0]!.slug}`);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">Suas organizações</h1>
        <p className="text-ink-muted">Escolha uma organização para gerenciar eventos e a equipe.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {organizations.map((org) => (
          <li key={org.id}>
            <Card className="h-full">
              <div className="grid gap-3">
                <CardTitle>{org.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{ROLE_LABELS[org.role]}</Badge>
                  <span className="text-sm text-ink-muted">/app/{org.slug}</span>
                </div>
                <Link href={`/app/${org.slug}`} className="text-sm font-semibold text-brand-700 hover:underline">
                  Abrir painel
                  <span className="sr-only"> de {org.name}</span>
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <EmptyState title="Criar outra organização" action={<Link href="/onboarding" className="text-sm font-semibold text-brand-700 hover:underline">Nova organização</Link>}>
        Use uma organização separada para cada igreja, empresa ou marca. Dados nunca são compartilhados entre elas.
      </EmptyState>
    </div>
  );
}
