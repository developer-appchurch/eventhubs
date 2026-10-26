import type { PublicTicket } from "@/modules/events/queries";

export type TicketAvailability = "available" | "paid" | "sold_out" | "not_started" | "ended";

// Espelha as regras de ingresso de public.register_for_event, só para exibir a escolha.
// Quem decide é o banco, sob a trava do evento. Ingresso pago depende de a organização ter
// conta de pagamento conectada.
export function ticketAvailability(
  ticket: Pick<PublicTicket, "price_cents" | "sales_start_at" | "sales_end_at" | "sold_out">,
  now: Date = new Date(),
  paymentsEnabled = false,
): TicketAvailability {
  if (ticket.sales_end_at && now >= new Date(ticket.sales_end_at)) return "ended";
  if (ticket.sales_start_at && now < new Date(ticket.sales_start_at)) return "not_started";
  if (ticket.price_cents > 0 && !paymentsEnabled) return "paid";
  if (ticket.sold_out) return "sold_out";
  return "available";
}

export const TICKET_AVAILABILITY_LABELS: Record<Exclude<TicketAvailability, "available">, string> = {
  paid: "Pagamento online indisponível",
  sold_out: "Esgotado",
  not_started: "Vendas ainda não abertas",
  ended: "Vendas encerradas",
};
