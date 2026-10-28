"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstErrors, formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/session";
import { canManageOrganization, type OrganizationRole } from "./roles";
import { createOrganizationSchema, updateOrganizationSchema } from "./schemas";

// Cria a organização e o vínculo de proprietário numa única função do banco. O dono é
// sempre o usuário da sessão; não há parâmetro de papel nem de usuário.
export async function createOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const rawName = text(formData, "name");
  const rawSlug = text(formData, "slug").trim() || slugify(rawName);
  const parsed = createOrganizationSchema.safeParse({ name: rawName, slug: rawSlug });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) return mapDatabaseError(error);

  const org = data as { slug: string };
  redirect(`/app/${org.slug}`);
}

// A permissão é verificada duas vezes: aqui (mensagem clara) e pela política RLS de UPDATE
// (garantia real). O id da organização é resolvido pelo slug dentro da sessão do usuário.
export async function updateOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateOrganizationSchema.safeParse({
    name: text(formData, "name"),
    organizationSlug: text(formData, "organizationSlug"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization:organizations!inner(id, slug)")
    .eq("status", "active")
    .eq("organizations.slug", parsed.data.organizationSlug)
    .maybeSingle();

  const role = membership?.role as OrganizationRole | undefined;
  const org = membership?.organization as unknown as { id: string } | null;
  if (!role || !org || !canManageOrganization(role)) {
    return { ok: false, message: "Você não tem permissão para alterar esta organização." };
  }

  const { data, error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", org.id)
    .select("id");

  if (error) return mapDatabaseError(error);
  if (!data?.length) return { ok: false, message: "Você não tem permissão para alterar esta organização." };

  // Re-renderiza o layout da organização (sidebar, seletor, título) na própria resposta da action.
  revalidatePath(`/app/${parsed.data.organizationSlug}`, "layout");
  return { ok: true, message: "Organização atualizada." };
}
