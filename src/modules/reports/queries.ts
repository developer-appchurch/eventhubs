import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventReport = {
  capacity: number;
  timezone: string;
  by_status: Partial<Record<"pending_payment" | "confirmed" | "cancelled" | "expired" | "refunded", number>>;
  checked_in: number;
  by_ticket: { name: string; price_cents: number; confirmed: number }[];
  daily: { day: string; n: number }[];
  finance: { approved_cents: number; platform_fee_cents: number; refunded_cents: number; attention: number };
};

export async function getEventReport(eventId: string): Promise<EventReport> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("event_report", { p_event_id: eventId });
  if (error) throw new Error("Não foi possível carregar o relatório.");
  return data as EventReport;
}
