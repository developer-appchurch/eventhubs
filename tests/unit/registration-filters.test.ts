import { describe, expect, it } from "vitest";
import { filterParams, parseOrgRegistrationFilters } from "../../src/modules/registrations/filters";

const parse = (params: Record<string, string>) => parseOrgRegistrationFilters((k) => params[k]);

describe("parseOrgRegistrationFilters", () => {
  it("converte o período para limites UTC no fuso padrão, incluindo o último dia inteiro", () => {
    const f = parse({ from: "2026-11-01", to: "2026-11-30" });
    expect(f.since).toBe("2026-11-01T03:00:00.000Z");
    expect(f.until).toBe("2026-12-01T03:00:00.000Z");
  });

  it("ignora valores inválidos", () => {
    expect(parse({ status: "x", event: "abc", from: "2026-02-31", to: "ontem", q: "a".repeat(200) })).toEqual({ q: "a".repeat(100) });
  });

  it("mantém status e evento válidos e devolve só os parâmetros preenchidos", () => {
    const event = "6f1c1f0e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    const f = parse({ status: "confirmed", event, q: "" });
    expect(f).toEqual({ q: "", status: "confirmed", event });
    expect(filterParams(f)).toEqual({ status: "confirmed", event });
  });
});
