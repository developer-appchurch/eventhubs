import { z } from "zod";
import { parsePriceToCents, zonedLocalToUtc } from "@/lib/datetime";

const optionalLocal = z.string().trim();

// Entrada do formulário de tipo de ingresso. Preço digitado em reais vira centavos; o
// período de venda é opcional e digitado no fuso do evento.
export function ticketTypeInputSchema(timeZone: string) {
  return z
    .object({
      name: z.string().trim().min(2, "Informe o nome do ingresso.").max(80, "Use no máximo 80 caracteres."),
      price: z.string().trim(),
      salesStartAt: optionalLocal,
      salesEndAt: optionalLocal,
      quantityLimit: z.string().trim(),
      minPerOrder: z.coerce.number("Informe um número.").int("Use um número inteiro.").min(1, "Mínimo 1."),
      maxPerOrder: z.coerce.number("Informe um número.").int("Use um número inteiro.").min(1, "Mínimo 1.").max(50, "Máximo 50 por pedido."),
      isActive: z.boolean(),
    })
    .transform((input, ctx) => {
      const priceCents = parsePriceToCents(input.price);
      if (priceCents === null || priceCents > 100000000) {
        ctx.addIssue({ code: "custom", path: ["price"], message: "Informe um valor como 50,00 (use 0 para gratuito)." });
      }

      let quantityLimit: number | null = null;
      if (input.quantityLimit !== "") {
        quantityLimit = Number(input.quantityLimit);
        if (!Number.isInteger(quantityLimit) || quantityLimit < 1) {
          ctx.addIssue({ code: "custom", path: ["quantityLimit"], message: "Use um número inteiro maior que zero ou deixe em branco." });
        }
      }

      if (input.maxPerOrder < input.minPerOrder) {
        ctx.addIssue({ code: "custom", path: ["maxPerOrder"], message: "O máximo deve ser maior ou igual ao mínimo." });
      }

      const toUtc = (field: "salesStartAt" | "salesEndAt") => {
        if (input[field] === "") return null;
        const date = zonedLocalToUtc(input[field], timeZone);
        if (!date) ctx.addIssue({ code: "custom", path: [field], message: "Data ou hora inválida." });
        return date;
      };
      const start = toUtc("salesStartAt");
      const end = toUtc("salesEndAt");
      if (start && end && end <= start) {
        ctx.addIssue({ code: "custom", path: ["salesEndAt"], message: "O fim das vendas deve ser depois do início." });
      }

      return {
        name: input.name,
        price_cents: priceCents ?? 0,
        sales_start_at: start?.toISOString() ?? null,
        sales_end_at: end?.toISOString() ?? null,
        quantity_limit: quantityLimit,
        min_per_order: input.minPerOrder,
        max_per_order: input.maxPerOrder,
        is_active: input.isActive,
      };
    });
}
