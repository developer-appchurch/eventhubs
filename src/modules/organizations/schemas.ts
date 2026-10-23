import { z } from "zod";
import { validateSlug } from "@/lib/slug";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da organização.").max(120, "Use no máximo 120 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const message = validateSlug(value);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da organização.").max(120, "Use no máximo 120 caracteres."),
  organizationSlug: z.string().min(1),
});
