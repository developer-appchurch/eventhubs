import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrganizationRole } from "@/modules/organizations/roles";
import type { PaymentStatus } from "./mercadopago";

// Espelha private.payment_reader_roles(): financeiro do evento.
export function canReadPayments(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin" || role === "event_manager" || role === "report_viewer";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendente",
  in_process: "Em análise",
  authorized: "Autorizado",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Contestado (chargeback)",
  in_mediation: "Em disputa",
};

export const PAYMENT_ATTENTION_LABELS = {
  amount_mismatch: "Valor diferente do ingresso: confira no Mercado Pago antes de confirmar.",
  paid_without_seat: "Pago depois de a reserva vencer, sem vaga disponível. O reembolso é automático; se não aparecer como reembolsado, faça pelo Mercado Pago.",
  duplicate_payment: "Segundo pagamento da mesma inscrição: reembolse pelo Mercado Pago.",
  paid_after_cancellation: "Pago após o cancelamento da inscrição: reembolse pelo Mercado Pago.",
} as const;

export type PaymentAccountStatus = { provider_user_id: string; live_mode: boolean; connected_at: string } | null;

export async function getPaymentAccountStatus(organizationId: string): Promise<PaymentAccountStatus> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("payment_account_status", { p_org: organizationId });
  if (error) throw new Error("Não foi possível carregar a conta de pagamento.");
  return data as PaymentAccountStatus;
}

export const PAYMENTS_PAGE_SIZE = 50;

export type PaymentListItem = {
  id: string;
  external_id: string;
  status: PaymentStatus;
  amount_cents: number;
  platform_fee_cents: number;
  attention: keyof typeof PAYMENT_ATTENTION_LABELS | null;
  created_at: string;
  // Nulo para quem lê pagamentos mas não dados pessoais (visualizador de relatórios).
  registrations: { attendee_name: string; attendee_email: string } | null;
};

export async function listPayments(eventId: string, page = 1): Promise<{ payments: PaymentListItem[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("payments")
    .select("id, external_id, status, amount_cents, platform_fee_cents, attention, created_at, registrations(attendee_name, attendee_email)", { count: "exact" })
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAYMENTS_PAGE_SIZE, page * PAYMENTS_PAGE_SIZE - 1);
  if (error) throw new Error("Não foi possível carregar os pagamentos.");
  return { payments: (data ?? []) as unknown as PaymentListItem[], total: count ?? 0 };
}
