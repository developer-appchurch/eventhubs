import { describe, expect, it } from "vitest";
import { eventInputSchema } from "@/modules/events/schemas";

const valid = {
  title: "Congresso de Jovens",
  slug: "congresso-jovens",
  description: "Descrição",
  format: "in_person",
  venueName: "Auditório",
  address: "Rua A, 1",
  onlineUrl: "",
  timezone: "America/Sao_Paulo",
  startsAt: "2026-11-20",
  endsAt: "2026-11-22",
  capacity: "100",
  contactEmail: "",
  contactPhone: "",
  participantTerms: "",
  isPaid: false,
  salesStartAt: "",
};

const paths = (input: typeof valid) => {
  const r = eventInputSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => i.path.join("."));
};

describe("eventInputSchema", () => {
  it("converte entrada válida para snake_case com datas em UTC", () => {
    const r = eventInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      venue_name: "Auditório",
      starts_at: "2026-11-20T03:00:00.000Z",
      ends_at: "2026-11-23T02:59:00.000Z",
      is_paid: false,
      capacity: 100,
      contact_email: null,
      contact_phone: null,
      sales_start_at: null,
    });
  });

  it("valida e normaliza o WhatsApp do organizador", () => {
    const r = eventInputSchema.safeParse({ ...valid, contactPhone: "11912345678" });
    expect(r.success && r.data.contact_phone).toBe("(11) 91234-5678");
    expect(paths({ ...valid, contactPhone: "(11) 3333-4444" })).toContain("contactPhone");
  });

  it("converte o início das vendas e recusa depois do fim do evento", () => {
    const r = eventInputSchema.safeParse({ ...valid, salesStartAt: "2026-11-01T09:00" });
    expect(r.success && r.data.sales_start_at).toBe("2026-11-01T12:00:00.000Z");
    expect(paths({ ...valid, salesStartAt: "2026-11-23T00:00" })).toContain("salesStartAt");
  });

  it("recusa término antes do início", () => {
    expect(paths({ ...valid, endsAt: "2026-11-19" })).toContain("endsAt");
    expect(eventInputSchema.safeParse({ ...valid, endsAt: "2026-11-20" }).success).toBe(true);
    expect(paths({ ...valid, startsAt: "2026-11-20T19:00" })).toContain("startsAt");
  });



  it("recusa capacidade 0 e fracionada", () => {
    expect(paths({ ...valid, capacity: "0" })).toContain("capacity");
    expect(paths({ ...valid, capacity: "1.5" })).toContain("capacity");
  });

  it("exige local para presencial, mas não para online", () => {
    expect(paths({ ...valid, venueName: "" })).toContain("venueName");
    expect(eventInputSchema.safeParse({ ...valid, format: "online", venueName: "" }).success).toBe(true);
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
