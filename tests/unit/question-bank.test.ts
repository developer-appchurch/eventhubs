import { describe, expect, it } from "vitest";
import { bankFieldKey, bankQuestionToField, formDefinitionSchema, missingAlwaysOn, parseBankQuestion, type BankQuestion } from "../../src/modules/forms/fields";

const q = (over: Partial<BankQuestion> = {}): BankQuestion => ({
  id: "6f1c2b9e-0d4a-4c1b-9a3e-1234567890ab",
  label: "CPF",
  type: "short_text",
  required: false,
  always_on: false,
  options: [],
  validation: {},
  help_text: "",
  placeholder: "",
  ...over,
});

describe("banco de perguntas", () => {
  it("gera chave estável e válida para o formulário", () => {
    const key = bankFieldKey(q().id);
    expect(key).toBe("q_6f1c2b9e0d4a4c1b9a3e1234567890ab");
    expect(key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it("pergunta 'sempre' entra obrigatória e o campo passa na validação do formulário", () => {
    const field = bankQuestionToField(q({ always_on: true }));
    expect(field).toMatchObject({ required: true, is_active: true, label: "CPF" });
    const base = { options: [], validation: {}, help_text: "", placeholder: "", is_active: true, required: true };
    const fields = [{ ...base, key: "full_name", label: "Nome", type: "name" as const }, { ...base, key: "email", label: "E-mail", type: "email" as const }, field];
    expect(formDefinitionSchema.safeParse(fields).success).toBe(true);
  });

  it("acusa pergunta 'sempre' ausente, desativada ou opcional", () => {
    const bank = [q({ always_on: true, required: true }), q({ id: "00000000-0000-4000-8000-000000000001", label: "Célula" })];
    const field = bankQuestionToField(bank[0]);
    expect(missingAlwaysOn([], bank).map((x) => x.label)).toEqual(["CPF"]);
    expect(missingAlwaysOn([{ ...field, is_active: false }], bank)).toHaveLength(1);
    expect(missingAlwaysOn([{ ...field, required: false }], bank)).toHaveLength(1);
    expect(missingAlwaysOn([field], bank)).toEqual([]);
  });

  it("valida a pergunta como um campo e força obrigatória quando 'sempre'", () => {
    const { id: _id, ...input } = q({ always_on: true });
    void _id;
    const r = parseBankQuestion(input);
    expect(r.ok && r.data.required).toBe(true);
    expect(parseBankQuestion({ ...input, type: "email" }).ok).toBe(false);
    expect(parseBankQuestion({ ...input, type: "dropdown", options: ["A"] }).ok).toBe(false);
    expect(parseBankQuestion({ ...input, label: " " }).ok).toBe(false);
  });
});
