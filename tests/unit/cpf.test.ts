import { describe, expect, it } from "vitest";
import { isValidCpf, maskCpf } from "@/lib/cpf";

describe("cpf", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("1234")).toBe(false);
  });

  it("aplica a máscara", () => {
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("5299")).toBe("529.9");
    expect(maskCpf("")).toBe("");
  });
});
