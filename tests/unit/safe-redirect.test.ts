import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("mantém caminhos internos", () => {
    expect(safeNextPath("/app/igreja")).toBe("/app/igreja");
  });

  it.each([
    ["https://evil.example"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["app"],
  ])("substitui destino inseguro %s pelo padrão", (candidate) => {
    expect(safeNextPath(candidate)).toBe("/app");
  });

  it("usa o padrão quando não há valor", () => {
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
  });
});
