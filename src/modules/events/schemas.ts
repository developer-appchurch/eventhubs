import { z } from "zod";
import { isEventTimezone, zonedLocalToUtc } from "@/lib/datetime";
import { validateSlug } from "@/lib/slug";
import { EVENT_FORMATS } from "./status";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => v || null);

const httpsUrl = z
  .string()
  .trim()
  .max(2048, "Endereço muito longo.")
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use um endereço completo começando com https://.")
  .transform((v) => v || null);

const localDateTime = z.string().min(1, "Informe data e hora.");

// Entrada do formulário de evento (strings do FormData). As datas chegam no fuso do evento
// e saem em UTC, já no formato das colunas da tabela events. As inscrições fecham no término
// do evento; a abertura e a capa (arquivo) são gravadas pela action.
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(3, "Informe o nome do evento (mínimo 3 caracteres).").max(140, "Use no máximo 140 caracteres."),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .superRefine((value, ctx) => {
        const message = validateSlug(value);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    description: z.string().trim().max(20000, "Descrição muito longa."),
    format: z.enum(EVENT_FORMATS, "Escolha o formato do evento."),
    venueName: z.string().trim().max(160, "Use no máximo 160 caracteres."),
    address: z.string().trim().max(300, "Use no máximo 300 caracteres."),
    onlineUrl: httpsUrl,
    timezone: z.string().refine(isEventTimezone, "Escolha um fuso horário da lista."),
    startsAt: localDateTime,
    endsAt: localDateTime,
    capacity: z.coerce
      .number("Informe a capacidade.")
      .int("Use um número inteiro.")
      .min(1, "A capacidade mínima é 1 pessoa.")
      .max(1000000, "Capacidade acima do limite."),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .refine((v) => v === "" || z.email().safeParse(v).success, "Informe um e-mail válido.")
      .transform((v) => v || null),
    contactPhone: optionalText(40),
    participantTerms: z.string().trim().max(20000, "Texto muito longo."),
    isPaid: z.boolean(),
  })
  .transform((input, ctx) => {
    const toUtc = (field: "startsAt" | "endsAt") => {
      const date = zonedLocalToUtc(input[field], input.timezone);
      if (!date) ctx.addIssue({ code: "custom", path: [field], message: "Data ou hora inválida." });
      return date;
    };
    const startsAt = toUtc("startsAt");
    const endsAt = toUtc("endsAt");
    if (!startsAt || !endsAt) return z.NEVER;

    if (endsAt <= startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O término deve ser depois do início." });
    }
    if (input.format !== "online" && input.venueName === "") {
      ctx.addIssue({ code: "custom", path: ["venueName"], message: "Informe o local do evento presencial ou híbrido." });
    }

    return {
      title: input.title,
      slug: input.slug,
      description: input.description,
      format: input.format,
      venue_name: input.venueName,
      address: input.address,
      online_url: input.onlineUrl,
      timezone: input.timezone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      registration_closes_at: endsAt.toISOString(),
      capacity: input.capacity,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      participant_terms: input.participantTerms,
      is_paid: input.isPaid,
    };
  });

export type EventRowInput = z.output<typeof eventInputSchema>;
