import { z } from "zod";
import { isValidCpf, maskCpf } from "@/lib/cpf";
import type { FormField } from "./fields";

export type RawAnswers = Record<string, string | string[] | undefined>;
export type AnswerValue = string | number | boolean | string[];

const TEXT_DEFAULT_MAX = { short_text: 200, long_text: 2000, name: 120 } as const;

// Valida respostas no servidor contra a definição (versão) do formulário. Campos inativos
// ou desconhecidos são ignorados; nada do navegador é aceito sem passar por aqui.
export function validateAnswers(
  fields: readonly FormField[],
  raw: RawAnswers,
): { ok: true; values: Record<string, AnswerValue> } | { ok: false; errors: Record<string, string> } {
  const values: Record<string, AnswerValue> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!field.is_active) continue;
    const input = raw[field.key];
    const list = (Array.isArray(input) ? input : input === undefined ? [] : [input]).map((v) => v.trim()).filter(Boolean);
    const single = list[0] ?? "";

    if (field.type === "consent") {
      const accepted = single === "on" || single === "true";
      if (field.required && !accepted) errors[field.key] = "É preciso aceitar para continuar.";
      else values[field.key] = accepted;
      continue;
    }

    if (list.length === 0) {
      if (field.required) errors[field.key] = "Campo obrigatório.";
      continue;
    }

    const error = checkValue(field, list, single);
    if (error) {
      errors[field.key] = error;
      continue;
    }
    values[field.key] =
      field.type === "multiple_choice" ? list : field.type === "number" ? Number(single.replace(",", ".")) : field.type === "cpf" ? maskCpf(single) : single;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

function checkValue(field: FormField, list: string[], value: string): string | null {
  const { min, max } = field.validation;
  switch (field.type) {
    case "email":
      return z.email().safeParse(value).success && value.length <= 254 ? null : "Informe um e-mail válido.";
    case "phone": {
      const digits = value.replace(/\D/g, "");
      return /^[\d\s()+-]+$/.test(value) && digits.length >= 10 && digits.length <= 13 ? null : "Informe um telefone com DDD.";
    }
    case "cpf":
      return isValidCpf(value) ? null : "Informe um CPF válido.";
    case "number": {
      const n = Number(value.replace(",", "."));
      if (!Number.isFinite(n)) return "Informe um número.";
      if (min !== undefined && n < min) return `O valor mínimo é ${min}.`;
      if (max !== undefined && n > max) return `O valor máximo é ${max}.`;
      return null;
    }
    case "date": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
      return d && d.getUTCDate() === +m![3] && d.getUTCMonth() === +m![2] - 1 ? null : "Informe uma data válida.";
    }
    case "single_choice":
    case "dropdown":
      return list.length === 1 && field.options.includes(value) ? null : "Escolha uma das opções.";
    case "multiple_choice":
      return list.every((v) => field.options.includes(v)) && new Set(list).size === list.length ? null : "Escolha entre as opções.";
    default: {
      const limit = max ?? TEXT_DEFAULT_MAX[field.type as keyof typeof TEXT_DEFAULT_MAX] ?? 200;
      if (value.length > limit) return `Use no máximo ${limit} caracteres.`;
      if (min !== undefined && value.length < min) return `Use pelo menos ${min} caracteres.`;
      return null;
    }
  }
}

// Lê as respostas de um FormData mantendo listas para seleção múltipla.
export function answersFromFormData(fields: readonly FormField[], formData: FormData): RawAnswers {
  const raw: RawAnswers = {};
  for (const field of fields) {
    const all = formData.getAll(`answer.${field.key}`).filter((v): v is string => typeof v === "string");
    raw[field.key] = field.type === "multiple_choice" ? all : all[0];
  }
  return raw;
}
