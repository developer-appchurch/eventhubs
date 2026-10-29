import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrganizationContext, listTeam } from "@/modules/organizations/queries";
import { ROLE_LABELS } from "@/modules/organizations/roles";

export const metadata: Metadata = { title: "Equipe e permissões" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export default async function TeamPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const members = await listTeam(org.id);

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Membros</CardTitle>
            <p className="text-sm text-ink-muted">
              Papéis definem o que cada pessoa pode fazer. Alterar papéis e convidar pessoas chega em uma próxima etapa.
            </p>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon="users" title="Nenhum membro encontrado">Verifique se a organização tem vínculos ativos.</EmptyState>
          </div>
        ) : (
          <div className="mt-6">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Membros da organização {org.name}</caption>
              <thead className="border-b border-line bg-brand-100 text-xs uppercase tracking-wide text-brand-900">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Nome</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Papel</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Situação</th>
                  <th scope="col" className="hidden py-2 font-semibold sm:table-cell">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((member) => (
                  <tr key={member.user_id} className="hover:bg-brand-50">
                    <td className="py-3 pr-3 font-medium">{member.full_name || "Sem nome informado"}</td>
                    <td className="py-3 pr-3">{ROLE_LABELS[member.role]}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={member.status === "active" ? "success" : "neutral"}>
                        {member.status === "active" ? "Ativo" : "Suspenso"}
                      </Badge>
                    </td>
                    <td className="hidden py-3 tabular-nums sm:table-cell">{dateFormat.format(new Date(member.joined_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
