import { z } from "zod";

export const FIELD_TYPES = [
  "name",
  "email",
  "phone",
  "short_text",
  "long_text",
  "number",
  "date",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "consent",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  short_text: "Texto curto",
  long_text: "Texto longo",
  number: "Número",
  date: "Data",
  single_choice: "Seleção única",
  multiple_choice: "Seleção múltipla",
  dropdown: "Lista suspensa",
  consent: "Consentimento",
};

export const CHOICE_TYPES: readonly FieldType[] = ["single_choice", "multiple_choice", "dropdown"];
// Tipos que identificam o participante: exatamente um de cada, sempre obrigatório.
export const IDENTITY_TYPES: readonly FieldType[] = ["name", "email"];

// min/max: comprimento para textos, valor para números.
export type FieldValidation = { min?: number; max?: number };

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  validation: FieldValidation;
  help_text: string;
  placeholder: string;
  is_active: boolean;
};

const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Identificador inválido."),
    label: z.string().trim().min(1, "Informe o rótulo do campo.").max(120, "Rótulo muito longo."),
    type: z.enum(FIELD_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1, "Opção vazia.").max(100, "Opção muito longa.")).max(50, "Máximo de 50 opções."),
    validation: z
      .object({ min: z.number().finite().optional(), max: z.number().finite().optional() })
      .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, "O mínimo deve ser menor ou igual ao máximo."),
    help_text: z.string().trim().max(300, "Texto de ajuda muito longo."),
    placeholder: z.string().trim().max(120, "Texto de exemplo muito longo."),
    is_active: z.boolean(),
  })
  .superRefine((field, ctx) => {
    if (CHOICE_TYPES.includes(field.type)) {
      if (field.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Informe pelo menos 2 opções." });
      if (new Set(field.options).size !== field.options.length) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "As opções não podem se repetir." });
      }
    }
  })
  .transform((field) => ({
    ...field,
    // Opções e limites só fazem sentido em certos tipos; o resto é descartado.
    options: CHOICE_TYPES.includes(field.type) ? field.options : [],
    validation: ["short_text", "long_text", "number"].includes(field.type) ? field.validation : {},
  }));

// Formulário completo enviado pelo construtor. Regras espelham save_event_form no banco.
export const formDefinitionSchema = z
  .array(fieldSchema)
  .min(2)
  .max(60, "Máximo de 60 campos.")
  .superRefine((fields, ctx) => {
    const keys = fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Há campos com o mesmo identificador." });
    for (const type of IDENTITY_TYPES) {
      const matches = fields.filter((f) => f.type === type);
      if (matches.length !== 1 || !matches[0].required || !matches[0].is_active) {
        ctx.addIssue({ code: "custom", message: `O formulário precisa de exatamente um campo "${FIELD_TYPE_LABELS[type]}", ativo e obrigatório.` });
      }
    }
  });

// Identificador estável gerado a partir do rótulo, sem colidir com os existentes.
export function fieldKeyFromLabel(label: string, existing: readonly string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "c_$1")
      .slice(0, 34) || "campo";
  let key = base;
  for (let i = 2; existing.includes(key); i++) key = `${base}_${i}`;
  return key;
}
