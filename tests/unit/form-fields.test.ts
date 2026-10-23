import { describe, expect, it } from "vitest";
import { fieldKeyFromLabel, formDefinitionSchema, type FormField } from "@/modules/forms/fields";

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
const name = f({ key: "nome", label: "Nome", type: "name", required: true });
const email = f({ key: "email", label: "E-mail", type: "email", required: true });

describe("formDefinitionSchema", () => {
  it("aceita nome e e-mail obrigatórios", () => {
    expect(formDefinitionSchema.safeParse([name, email]).success).toBe(true);
  });

  it("recusa formulário sem e-mail", () => {
    expect(formDefinitionSchema.safeParse([name, f({ key: "x" })]).success).toBe(false);
  });

  it("recusa e-mail não obrigatório", () => {
    expect(formDefinitionSchema.safeParse([name, { ...email, required: false }]).success).toBe(false);
  });

  it("recusa dois campos de nome", () => {
    expect(formDefinitionSchema.safeParse([name, email, { ...name, key: "nome2" }]).success).toBe(false);
  });

  it("recusa chaves duplicadas", () => {
    expect(formDefinitionSchema.safeParse([name, email, f({ key: "x" }), f({ key: "x" })]).success).toBe(false);
  });

  it("recusa lista suspensa com menos de 2 opções", () => {
    const dd = f({ key: "d", type: "dropdown", options: ["A"] });
    expect(formDefinitionSchema.safeParse([name, email, dd]).success).toBe(false);
  });

  it("recusa opções repetidas", () => {
    const dd = f({ key: "d", type: "dropdown", options: ["A", "A"] });
    expect(formDefinitionSchema.safeParse([name, email, dd]).success).toBe(false);
  });

  it("descarta opções de tipos que não são de escolha", () => {
    const r = formDefinitionSchema.safeParse([name, email, f({ key: "t", options: ["A", "B"] })]);
    expect(r.success && r.data[2].options).toEqual([]);
  });
});

describe("fieldKeyFromLabel", () => {
  it("remove acentos e símbolos", () => {
    expect(fieldKeyFromLabel("Igreja / Congregação", [])).toBe("igreja_congregacao");
  });

  it("evita colisão com sufixo", () => {
    expect(fieldKeyFromLabel("Igreja", ["igreja"])).toBe("igreja_2");
    expect(fieldKeyFromLabel("Igreja", ["igreja", "igreja_2"])).toBe("igreja_3");
  });

  it("prefixa rótulo que começa com dígito", () => {
    expect(fieldKeyFromLabel("2 pessoas", [])).toBe("c_2_pessoas");
  });

  it("usa 'campo' para rótulo vazio", () => {
    expect(fieldKeyFromLabel("", [])).toBe("campo");
  });
});
