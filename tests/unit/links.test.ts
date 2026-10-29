import { describe, expect, it } from "vitest";
import { calendarUrl, mapsUrl } from "@/lib/links";

describe("links", () => {
  it("codifica o endereço no mapa", () => {
    expect(mapsUrl("Rua A, 10 São Paulo")).toContain("query=Rua%20A%2C%2010%20S%C3%A3o%20Paulo");
  });

  it("monta o link da agenda em UTC e omite o local de evento online", () => {
    const base = { title: "Culto", starts_at: "2026-11-20T22:30:00.000Z", ends_at: "2026-11-21T01:00:00Z", venue_name: "Igreja", address: "Rua A", format: "in_person" };
    const url = new URL(calendarUrl(base, "Org"));
    expect(url.searchParams.get("dates")).toBe("20261120T223000Z/20261121T010000Z");
    expect(url.searchParams.get("location")).toBe("Igreja, Rua A");
    expect(new URL(calendarUrl({ ...base, format: "online" }, "Org")).searchParams.has("location")).toBe(false);
  });
});
