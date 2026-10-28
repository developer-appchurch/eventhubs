import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { safeNextPath } from "@/lib/safe-redirect";
import { PATHNAME_HEADER, replaceOrganizationSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrganizationRole } from "./roles";

export type OrganizationSummary = { id: string; slug: string; name: string };
export type OrganizationContext = OrganizationSummary & { role: OrganizationRole };
export type TeamMember = {
  user_id: string;
  full_name: string | null;
  role: OrganizationRole;
  status: "active" | "suspended";
  joined_at: string;
};

// Todas as consultas usam o cliente do usuário: a RLS limita o resultado às organizações
// em que ele é membro ativo. O filtro por slug é conveniência, não barreira de segurança.

export const listMyOrganizations = cache(async function listMyOrganizations(): Promise<OrganizationContext[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(id, slug, name)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error("Não foi possível carregar as organizações.");

  return (data ?? []).flatMap((row) => {
    const org = row.organization as unknown as OrganizationSummary | null;
    return org ? [{ ...org, role: row.role as OrganizationRole }] : [];
  });
});

export const getOrganizationContext = cache(async function getOrganizationContext(slug: string): Promise<OrganizationContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations!inner(id, slug, name)")
    .eq("status", "active")
    .eq("organizations.slug", slug)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a organização.");
  if (!data) return null;

  const org = data.organization as unknown as OrganizationSummary;
  return { ...org, role: data.role as OrganizationRole };
});

export async function listTeam(organizationId: string): Promise<TeamMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_organization_members", {
    p_organization_id: organizationId,
  });

  if (error) throw new Error("Não foi possível carregar a equipe.");
  return (data ?? []) as TeamMember[];
}

// Slug que não existe mais: se for um endereço antigo de uma organização, redireciona para o
// mesmo caminho com o endereço atual. Chamado só antes de um notFound(), nunca no caminho feliz.
export async function redirectIfOrganizationRenamed(slug: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("resolve_organization_slug", { p_slug: slug });
  if (typeof data !== "string" || !data) return;
  const path = (await headers()).get(PATHNAME_HEADER) ?? `/${slug}`;
  // Temporário (307): um 308 ficaria em cache no navegador e criaria laço se o endereço antigo voltar a ser usado.
  redirect(safeNextPath(replaceOrganizationSlug(path, slug, data), `/${data}`));
}
