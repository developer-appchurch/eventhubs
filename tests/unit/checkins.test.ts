import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "../../src/lib/csv";
import { mapDatabaseError } from "../../src/lib/errors";
import { cameraErrorMessage, checkinUrl, parseCheckinCode } from "../../src/modules/checkins/code";

const code = "0123456789abcdef0123456789abcdef";

describe("parseCheckinCode", () => {
  it("aceita o código puro ou o link do QR", () => {
    expect(parseCheckinCode(` ${code.toUpperCase()} `)).toBe(code);
    expect(parseCheckinCode(checkinUrl("https://app.test/", "org", "ev", code))).toBe(code);
  });

  it("texto comum ou código malformado não é código", () => {
    expect(parseCheckinCode("Maria Silva")).toBeNull();
    expect(parseCheckinCode(code.slice(1))).toBeNull();
    expect(parseCheckinCode(`https://x/?code=${code}0`)).toBeNull();
    expect(parseCheckinCode(undefined)).toBeNull();
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+5511999")).toBe("'+5511999");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(["x", "y"])).toBe("x, y");
    expect(csvCell(null)).toBe("");
    expect(csvRow(["Ana", 1, true])).toBe("Ana;1;true\r\n");
  });
});

describe("erros do check-in", () => {
  it.each(["CHECKIN_NOT_FOUND", "CHECKIN_UNAVAILABLE", "REGISTRATION_NOT_CONFIRMED"])("%s tem mensagem própria", (c) => {
    expect(mapDatabaseError({ code: "P0001", message: c }).message).not.toBe("Não foi possível concluir a operação.");
  });
});

describe("cameraErrorMessage", () => {
  it("explica permissão negada, câmera ausente e falha genérica", () => {
    expect(cameraErrorMessage({ name: "NotAllowedError" })).toMatch(/permissão/i);
    expect(cameraErrorMessage({ name: "NotFoundError" })).toMatch(/nenhuma câmera/i);
    expect(cameraErrorMessage(new Error("unsupported"))).toMatch(/digitar o código/);
    expect(cameraErrorMessage(null)).toMatch(/digitar o código/);
  });
});
