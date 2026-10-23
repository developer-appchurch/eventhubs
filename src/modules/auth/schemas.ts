import { z } from "zod";

const email = z.email({ message: "Informe um e-mail válido." }).trim().toLowerCase().max(254);
const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha."),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120, "Use no máximo 120 caracteres."),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120, "Use no máximo 120 caracteres."),
});
