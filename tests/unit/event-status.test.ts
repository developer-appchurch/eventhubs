import { describe, expect, it } from "vitest";
import { canManageEvents, EVENT_TRANSITIONS, publicAvailability, type EventStatus } from "@/modules/events/status";

const ev = (status: EventStatus) => ({
  status,
  ends_at: "2026-11-02T00:00:00Z",
});
const at = (s: string) => new Date(s);

describe("publicAvailability", () => {
  it("rascunho e cancelado independem das datas", () => {
    expect(publicAvailability(ev("draft"), at("2026-10-15T00:00:00Z"))).toBe("draft");
    expect(publicAvailability(ev("cancelled"), at("2026-10-15T00:00:00Z"))).toBe("cancelled");
  });

  it("publicado dentro do prazo está aberto", () => {
    expect(publicAvailability(ev("published"), at("2026-10-15T00:00:00Z"))).toBe("open");
  });



  it("publicado após o fim do evento está encerrado", () => {
    expect(publicAvailability(ev("published"), at("2026-11-03T00:00:00Z"))).toBe("ended");
  });

  it("status registration_closed e ended prevalecem", () => {
    expect(publicAvailability(ev("registration_closed"), at("2026-10-15T00:00:00Z"))).toBe("closed");
    expect(publicAvailability(ev("ended"), at("2026-10-15T00:00:00Z"))).toBe("ended");
  });
});

describe("EVENT_TRANSITIONS", () => {
  it("encerrado e cancelado são finais", () => {
    expect(EVENT_TRANSITIONS.ended).toEqual([]);
    expect(EVENT_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("canManageEvents", () => {
  it("permite owner, admin e event_manager", () => {
    for (const r of ["owner", "admin", "event_manager"] as const) expect(canManageEvents(r)).toBe(true);
  });

  it("nega checkin_operator e report_viewer", () => {
    for (const r of ["checkin_operator", "report_viewer"] as const) expect(canManageEvents(r)).toBe(false);
  });
});
