"use server";

import { revalidatePath } from "next/cache";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canManageOrganization } from "@/modules/organizations/roles";

// Desconecta a conta Mercado Pago da organização. O banco repete o papel e recusa com reserva valendo.
export async function disconnectPaymentAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  if (!org || !canManageOrganization(org.role)) return { ok: false, message: "Apenas proprietários e administradores podem desconectar a conta." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("disconnect_payment_account", { p_org: org.id });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/settings`);
  return { ok: true, message: "Conta Mercado Pago desconectada. Ingressos pagos não aceitam inscrição até você conectar outra conta." };
}
