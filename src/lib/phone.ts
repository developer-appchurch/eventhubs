// WhatsApp do organizador: celular brasileiro, DDD (11 a 99) + 9 + 8 dígitos. Aceita o 55 na frente.
export function phoneDigits(value: string): string {
  const d = value.replace(/\D/g, "");
  return d.length === 13 && d.startsWith("55") ? d.slice(2) : d;
}

export function isMobileBR(value: string): boolean {
  return /^[1-9]{2}9\d{8}$/.test(phoneDigits(value));
}

// Máscara (DD) 9XXXX-XXXX enquanto a pessoa digita.
export function maskPhone(value: string): string {
  const d = phoneDigits(value).slice(0, 11);
  if (d.length <= 2) return d && `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Link wa.me só para número válido; telefones antigos em outro formato ficam sem botão.
export function whatsappUrl(value: string | null): string | null {
  return value && isMobileBR(value) ? `https://wa.me/55${phoneDigits(value)}` : null;
}
