import { describe, expect, it } from "vitest";
import { ticketTypeInputSchema } from "@/modules/ticket-types/schemas";

const schema = ticketTypeInputSchema("America/Sao_Paulo");
const valid = {
  name: "Geral",
  price: "",
  salesStartAt: "",
  salesEndAt: "",
  quantityLimit: "",
  minPerOrder: "1",
  maxPerOrder: "5",
  isActive: true,
};

const paths = (input: object) => {
  const r = schema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => i.path.join("."));
};

describe("ticketTypeInputSchema", () => {
  it("aceita ingresso gratuito e converte vazios", () => {
    const r = schema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ price_cents: 0, quantity_limit: null, sales_start_at: null, sales_end_at: null, min_per_order: 1, max_per_order: 5 });
  });

  it("converte preço em centavos", () => {
    const r = schema.safeParse({ ...valid, price: "50,00" });
    expect(r.success && r.data.price_cents).toBe(5000);
  });

  it("recusa preço inválido", () => {
    expect(paths({ ...valid, price: "abc" })).toContain("price");
  });

  it("recusa máximo menor que o mínimo", () => {
    expect(paths({ ...valid, minPerOrder: "3", maxPerOrder: "2" })).toContain("maxPerOrder");
  });

  it("recusa limite 0 e converte vazio em null", () => {
    expect(paths({ ...valid, quantityLimit: "0" })).toContain("quantityLimit");
    const r = schema.safeParse({ ...valid, quantityLimit: "" });
    expect(r.success && r.data.quantity_limit).toBeNull();
  });

  it("recusa fim das vendas antes do início", () => {
    expect(paths({ ...valid, salesStartAt: "2026-11-20T10:00", salesEndAt: "2026-11-20T09:00" })).toContain("salesEndAt");
  });

  it("converte datas de venda para UTC", () => {
    const r = schema.safeParse({ ...valid, salesStartAt: "2026-11-01T10:00", salesEndAt: "2026-11-20T10:00" });
    expect(r.success && [r.data.sales_start_at, r.data.sales_end_at]).toEqual(["2026-11-01T13:00:00.000Z", "2026-11-20T13:00:00.000Z"]);
  });
});
