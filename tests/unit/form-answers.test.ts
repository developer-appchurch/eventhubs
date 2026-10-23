import { describe, expect, it } from "vitest";
import type { FormField } from "@/modules/forms/fields";
import { answersFromFormData, validateAnswers } from "@/modules/forms/answers";

const f = (over: Partial<FormField>): FormField => ({
  key: "campo",
  label: "Campo",
  type: "short_text",
  required: false,
  options: [],
  validation: {},
  help_text: "",
  placeholder: "",
  is_active: true,
  ...over,
});

const errors = (fields: FormField[], raw: Record<string, string | string[] | undefined>) => {
  const r = validateAnswers(fields, raw);
  return r.ok ? null : r.errors;
};

describe("validateAnswers", () => {
  it("exige campo obrigatório", () => {
    expect(errors([f({ required: true })], {})).toHaveProperty("campo");
    expect(errors([f({ required: true })], { campo: "  " })).toHaveProperty("campo");
  });

  it("valida e-mail", () => {
    const e = f({ type: "email" });
    expect(errors([e], { campo: "x@y" })).toHaveProperty("campo");
    expect(validateAnswers([e], { campo: "a@b.com" }).ok).toBe(true);
  });

  it("valida telefone", () => {
    const p = f({ type: "phone" });
    expect(validateAnswers([p], { campo: "(11) 98765-4321" }).ok).toBe(true);
    expect(errors([p], { campo: "123" })).toHaveProperty("campo");
  });

  it("valida número com mínimo e máximo", () => {
    const n = f({ type: "number", validation: { min: 1, max: 10 } });
    expect(errors([n], { campo: "0" })).toHaveProperty("campo");
    expect(errors([n], { campo: "11" })).toHaveProperty("campo");
    expect(errors([n], { campo: "x" })).toHaveProperty("campo");
    const r = validateAnswers([n], { campo: "2,5" });
    expect(r.ok && r.values.campo).toBe(2.5);
  });

  it("recusa data inexistente", () => {
    const d = f({ type: "date" });
    expect(errors([d], { campo: "2026-02-30" })).toHaveProperty("campo");
    expect(validateAnswers([d], { campo: "2026-02-28" }).ok).toBe(true);
  });

  it("recusa valor de seleção única fora das opções", () => {
    const s = f({ type: "single_choice", options: ["A", "B"] });
    expect(errors([s], { campo: "C" })).toHaveProperty("campo");
    expect(validateAnswers([s], { campo: "A" }).ok).toBe(true);
  });

  it("seleção múltipla devolve lista e recusa opção desconhecida", () => {
    const m = f({ type: "multiple_choice", options: ["A", "B", "C"] });
    const r = validateAnswers([m], { campo: ["A", "C"] });
    expect(r.ok && r.values.campo).toEqual(["A", "C"]);
    expect(errors([m], { campo: ["A", "Z"] })).toHaveProperty("campo");
  });

  it("consentimento obrigatório exige aceite", () => {
    const c = f({ type: "consent", required: true });
    expect(errors([c], {})).toHaveProperty("campo");
    const r = validateAnswers([c], { campo: "on" });
    expect(r.ok && r.values.campo).toBe(true);
  });

  it("ignora campos inativos e chaves desconhecidas", () => {
    const r = validateAnswers([f({ required: true, is_active: false })], { extra: "x" });
    expect(r).toEqual({ ok: true, values: {} });
  });

  it("recusa texto curto acima de 200 caracteres", () => {
    expect(errors([f({})], { campo: "a".repeat(201) })).toHaveProperty("campo");
    expect(validateAnswers([f({})], { campo: "a".repeat(200) }).ok).toBe(true);
  });
});

describe("answersFromFormData", () => {
  it("lê answer.<chave> e usa getAll em seleção múltipla", () => {
    const fields = [f({ key: "a" }), f({ key: "m", type: "multiple_choice", options: ["X", "Y"] })];
    const fd = new FormData();
    fd.append("answer.a", "oi");
    fd.append("answer.m", "X");
    fd.append("answer.m", "Y");
    fd.append("outro", "ignorado");
    expect(answersFromFormData(fields, fd)).toEqual({ a: "oi", m: ["X", "Y"] });
  });
});
