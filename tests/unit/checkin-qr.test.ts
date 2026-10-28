import QRCode from "qrcode";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { checkinUrl, parseCheckinCode } from "../../src/modules/checkins/code";

const code = "0123456789abcdef0123456789abcdef";

// Gera a imagem do QR como o app gera (qrcode) e lê de volta (jsqr), como faz a leitura pela câmera.
describe("leitura do QR pela foto", () => {
  it("recupera o código do link gerado para a inscrição", () => {
    const text = checkinUrl("https://app.test", "org", "ev", code);
    const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    const scale = 4;
    const border = 4;
    const side = (size + border * 2) * scale;
    const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (data[y * size + x]) {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const px = ((y + border) * scale + dy) * side + (x + border) * scale + dx;
              rgba.fill(0, px * 4, px * 4 + 3);
              rgba[px * 4 + 3] = 255;
            }
        }
    const result = jsQR(rgba, side, side);
    expect(parseCheckinCode(result?.data)).toBe(code);
  });
});
