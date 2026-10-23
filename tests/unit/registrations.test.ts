import { describe, expect, it } from "vitest";
import { mapDatabaseError } from "../../src/lib/errors";
import { ticketAvailability } from "../../src/modules/registrations/tickets";

const now = new Date("2026-11-01T12:00:00Z");
const free = { price_cents: 0, sales_start_at: null, sales_end_at: null, sold_out: false };

describe("ticketAvailability", () => {
  it("ingresso gratuito sem período está disponível", () => {
    expect(ticketAvailability(free, now)).toBe("available");
  });

  it("respeita início e fim das vendas", () => {
    expect(ticketAvailability({ ...free, sales_start_at: "2026-11-02T00:00:00Z" }, now)).toBe("not_started");
    expect(ticketAvailability({ ...free, sales_end_at: "2026-11-01T12:00:00Z" }, now)).toBe("ended");
    expect(ticketAvailability({ ...free, sales_start_at: "2026-10-01T00:00:00Z", sales_end_at: "2026-12-01T00:00:00Z" }, now)).toBe("available");
  });

  it("pago ainda não aceita inscrição e esgotado não aparece como disponível", () => {
    expect(ticketAvailability({ ...free, price_cents: 1000 }, now)).toBe("paid");
    expect(ticketAvailability({ ...free, sold_out: true }, now)).toBe("sold_out");
  });
});

describe("erros da inscrição", () => {
  it.each(["SOLD_OUT", "TICKET_SOLD_OUT", "ALREADY_REGISTERED", "REGISTRATION_CLOSED", "FORM_OUTDATED", "PAID_TICKET", "INVALID_ANSWERS", "TICKET_UNAVAILABLE"])(
    "%s tem mensagem própria",
    (code) => {
      const result = mapDatabaseError({ code: "P0001", message: code });
      expect(result.ok).toBe(false);
      expect(result.message).not.toBe("Não foi possível concluir a operação.");
    },
  );

  it("FK violada (ingresso com inscrições) sugere desativar", () => {
    expect(mapDatabaseError({ code: "23503" }).message).toMatch(/Desative/);
  });
});
