// CSV para Excel em português: separador ";" e BOM UTF-8. Células que começam com = + - @
// tab ou CR recebem um apóstrofo, para a planilha não executá-las como fórmula.
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join(", ") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(";") + "\r\n";
}

export const CSV_BOM = "﻿";
