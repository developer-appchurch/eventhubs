import { describe, expect, it } from "vitest";
import { publishReadiness } from "@/lib/readiness";

const base = { base: "/b", settingsHref: "/s", activeTickets: [], hasDescription: true, hasCover: true, paymentsConnected: false };

describe("publishReadiness", () => {
  it("sem ingresso, pede para criar um", () => {
    const items = publishReadiness(base);
    expect(items.find((i) => i.label.startsWith("Criar"))?.done).toBe(false);
  });

  it("só cobra o Mercado Pago quando há ingresso pago", () => {
    expect(publishReadiness({ ...base, activeTickets: [{ price_cents: 0 }] }).some((i) => i.label.includes("Mercado Pago"))).toBe(false);
    const paid = publishReadiness({ ...base, activeTickets: [{ price_cents: 5000 }] });
    expect(paid.find((i) => i.label.includes("Mercado Pago"))?.done).toBe(false);
    expect(publishReadiness({ ...base, activeTickets: [{ price_cents: 5000 }], paymentsConnected: true }).every((i) => i.done)).toBe(true);
  });
});
