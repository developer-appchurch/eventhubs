import { describe, expect, it } from "vitest";
import { mapDatabaseError } from "@/lib/errors";

describe("mapDatabaseError", () => {
  it("traduz slug duplicado para erro de campo", () => {
    expect(mapDatabaseError({ code: "23505" })).toEqual({
      ok: false,
      fieldErrors: { slug: "Este identificador já está em uso." },
    });
  });

  it("nunca expõe mensagens internas do banco", () => {
    const result = mapDatabaseError({ code: "XX000", message: 'relation "public.secret" does not exist' });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.message).toBe("Não foi possível concluir a operação. Tente novamente.");
  });

  it("traduz falta de permissão", () => {
    expect(mapDatabaseError({ code: "42501" }).message).toBe("Você não tem permissão para realizar esta ação.");
  });
});
