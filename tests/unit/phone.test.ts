import { describe, expect, it } from "vitest";
import { isMobileBR, maskPhone, whatsappUrl } from "@/lib/phone";

describe("phone", () => {
  it("aplica a máscara enquanto digita", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("1")).toBe("(1");
    expect(maskPhone("1191")).toBe("(11) 91");
    expect(maskPhone("11912345678")).toBe("(11) 91234-5678");
    expect(maskPhone("119123456789")).toBe("(11) 91234-5678");
    expect(maskPhone("+55 11 91234-5678")).toBe("(11) 91234-5678");
  });

  it("aceita só celular com DDD", () => {
    expect(isMobileBR("(11) 91234-5678")).toBe(true);
    expect(isMobileBR("+55 (21) 99876-5432")).toBe(true);
    expect(isMobileBR("(11) 3333-4444")).toBe(false);
    expect(isMobileBR("(01) 91234-5678")).toBe(false);
    expect(isMobileBR("(11) 81234-5678")).toBe(false);
    expect(isMobileBR("91234-5678")).toBe(false);
  });

  it("monta o link do WhatsApp com 55", () => {
    expect(whatsappUrl("(11) 91234-5678")).toBe("https://wa.me/5511912345678");
    expect(whatsappUrl("3333-4444")).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
});
