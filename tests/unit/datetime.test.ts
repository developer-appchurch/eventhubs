import { describe, expect, it } from "vitest";
import { isEventTimezone, parsePriceToCents, utcToZonedLocal, zonedLocalToUtc } from "@/lib/datetime";

describe("zonedLocalToUtc", () => {
  it("converte Brasília (UTC-3)", () => {
    expect(zonedLocalToUtc("2026-11-20T19:30", "America/Sao_Paulo")?.toISOString()).toBe("2026-11-20T22:30:00.000Z");
  });

  it("converte Noronha (UTC-2)", () => {
    expect(zonedLocalToUtc("2026-11-20T19:30", "America/Noronha")?.toISOString()).toBe("2026-11-20T21:30:00.000Z");
  });

  it("converte Rio Branco (UTC-5) cruzando o dia", () => {
    expect(zonedLocalToUtc("2026-11-20T19:30", "America/Rio_Branco")?.toISOString()).toBe("2026-11-21T00:30:00.000Z");
  });

  it("retorna null para entradas inválidas", () => {
    expect(zonedLocalToUtc("2026-02-31T10:00", "America/Sao_Paulo")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20 19:30", "America/Sao_Paulo")).toBeNull();
    expect(zonedLocalToUtc("abc", "America/Sao_Paulo")).toBeNull();
  });
});

describe("utcToZonedLocal", () => {
  it("é o inverso de zonedLocalToUtc", () => {
    for (const tz of ["America/Sao_Paulo", "America/Noronha", "America/Manaus", "America/Rio_Branco"]) {
      const d = zonedLocalToUtc("2026-11-20T19:30", tz)!;
      expect(utcToZonedLocal(d.toISOString(), tz)).toBe("2026-11-20T19:30");
    }
  });

  it("retorna vazio para nulo", () => {
    expect(utcToZonedLocal(null, "America/Sao_Paulo")).toBe("");
  });
});

describe("parsePriceToCents", () => {
  it.each([
    ["50", 5000],
    ["50,5", 5050],
    ["1.234,56", 123456],
    ["12.90", 1290],
    ["R$ 10,00", 1000],
    ["", 0],
  ])("interpreta %j como %i centavos", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(["abc", "1,234", "-5"])("recusa %j", (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });
});

describe("isEventTimezone", () => {
  it("aceita só fusos da lista", () => {
    expect(isEventTimezone("America/Sao_Paulo")).toBe(true);
    expect(isEventTimezone("Europe/Paris")).toBe(false);
  });
});
