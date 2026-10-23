import { describe, expect, it } from "vitest";
import { eventInputSchema } from "@/modules/events/schemas";

const valid = {
  title: "Congresso de Jovens",
  slug: "congresso-jovens",
  description: "Descrição",
  coverImageUrl: "",
  format: "in_person",
  venueName: "Auditório",
  address: "Rua A, 1",
  onlineUrl: "",
  timezone: "America/Sao_Paulo",
  startsAt: "2026-11-20T19:00",
  endsAt: "2026-11-20T22:00",
  registrationOpensAt: "2026-10-01T08:00",
  registrationClosesAt: "2026-11-20T18:00",
  capacity: "100",
  contactEmail: "",
  contactPhone: "",
  participantTerms: "",
};

const paths = (input: Record<string, string>) => {
  const r = eventInputSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => i.path.join("."));
};

describe("eventInputSchema", () => {
  it("converte entrada válida para snake_case com datas em UTC", () => {
    const r = eventInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      cover_image_url: null,
      venue_name: "Auditório",
      starts_at: "2026-11-20T22:00:00.000Z",
      ends_at: "2026-11-21T01:00:00.000Z",
      registration_opens_at: "2026-10-01T11:00:00.000Z",
      registration_closes_at: "2026-11-20T21:00:00.000Z",
      capacity: 100,
      contact_email: null,
      contact_phone: null,
    });
  });

  it("recusa término antes do início", () => {
    expect(paths({ ...valid, endsAt: "2026-11-20T18:00", registrationClosesAt: "2026-11-20T17:00" })).toContain("endsAt");
  });

  it("recusa encerramento das inscrições depois do fim do evento", () => {
    expect(paths({ ...valid, registrationClosesAt: "2026-11-20T23:00" })).toContain("registrationClosesAt");
  });

  it("recusa encerramento antes da abertura", () => {
    expect(paths({ ...valid, registrationClosesAt: "2026-09-01T08:00" })).toContain("registrationClosesAt");
  });

  it("recusa capacidade 0 e fracionada", () => {
    expect(paths({ ...valid, capacity: "0" })).toContain("capacity");
    expect(paths({ ...valid, capacity: "1.5" })).toContain("capacity");
  });

  it("exige local para presencial, mas não para online", () => {
    expect(paths({ ...valid, venueName: "" })).toContain("venueName");
    expect(eventInputSchema.safeParse({ ...valid, format: "online", venueName: "" }).success).toBe(true);
  });

  it("recusa capa http e converte vazio em null", () => {
    expect(paths({ ...valid, coverImageUrl: "http://x" })).toContain("coverImageUrl");
    const r = eventInputSchema.safeParse({ ...valid, coverImageUrl: "" });
    expect(r.success && r.data.cover_image_url).toBeNull();
  });

  it("recusa e-mail de contato inválido", () => {
    expect(paths({ ...valid, contactEmail: "nao-e-email" })).toContain("contactEmail");
  });

  it("recusa slug reservado", () => {
    expect(paths({ ...valid, slug: "admin" })).toContain("slug");
  });

  it("recusa fuso fora da lista", () => {
    expect(paths({ ...valid, timezone: "Europe/Paris" })).toContain("timezone");
  });
});
