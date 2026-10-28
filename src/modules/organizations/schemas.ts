import { z } from "zod";
import { validateSlug } from "@/lib/slug";

const nameSchema = z.string().trim().min(2, "Informe o nome da organização.").max(120, "Use no máximo 120 caracteres.");

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const message = validateSlug(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

export const createOrganizationSchema = z.object({ name: nameSchema, slug: slugSchema });

export const updateOrganizationSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  organizationSlug: z.string().min(1),
});
