import { describe, expect, it } from "vitest";
import { replaceOrganizationSlug, slugify, validateSlug } from "@/lib/slug";

describe("slugify", () => {
  it("remove acentos, normaliza espaços e hífens", () => {
    expect(slugify("  Igreja São João — Congresso  ")).toBe("igreja-sao-joao-congresso");
  });

  it("retorna vazio quando não há caracteres utilizáveis", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("validateSlug", () => {
  it("aceita identificadores válidos", () => {
    expect(validateSlug("igreja-exemplo")).toBeNull();
  });

  it("recusa tamanho fora do intervalo", () => {
    expect(validateSlug("ab")).not.toBeNull();
    expect(validateSlug("a".repeat(61))).not.toBeNull();
  });

  it("recusa formato inválido e hífens nas bordas", () => {
    expect(validateSlug("Igreja")).not.toBeNull();
    expect(validateSlug("-igreja")).not.toBeNull();
    expect(validateSlug("igreja-")).not.toBeNull();
    expect(validateSlug("igreja--x")).not.toBeNull();
  });

  it("recusa rotas reservadas", () => {
    expect(validateSlug("app")).not.toBeNull();
    expect(validateSlug("account")).not.toBeNull();
  });
});

describe("replaceOrganizationSlug", () => {
  it("troca só o segmento da organização e mantém caminho e query", () => {
    expect(replaceOrganizationSlug("/igreja-velha/culto/inscricao/tok", "igreja-velha", "igreja-nova")).toBe("/igreja-nova/culto/inscricao/tok");
    expect(replaceOrganizationSlug("/app/igreja-velha/events/1/checkin?code=a?b", "igreja-velha", "igreja-nova")).toBe(
      "/app/igreja-nova/events/1/checkin?code=a?b",
    );
    expect(replaceOrganizationSlug("/Igreja-Velha", "igreja-velha", "igreja-nova")).toBe("/igreja-nova");
  });

  it("sem o segmento, vai para a página pública da organização", () => {
    expect(replaceOrganizationSlug("/outra", "igreja-velha", "igreja-nova")).toBe("/igreja-nova");
  });
});
