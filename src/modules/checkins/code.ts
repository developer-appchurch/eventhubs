// Código do QR: 32 hexadecimais. A leitura pode chegar como o código puro (leitor que digita)
// ou como o link inteiro gerado no QR (câmera do celular).
const CODE = /^[0-9a-f]{32}$/;

export function parseCheckinCode(input: string | undefined): string | null {
  const value = (input ?? "").trim().toLowerCase();
  if (CODE.test(value)) return value;
  const match = /[?&]code=([0-9a-f]{32})(?:&|$)/.exec(value);
  return match ? match[1] : null;
}

// Link que vai no QR: abre a tela de check-in do evento já com o código, para quem é da equipe.
export function checkinUrl(appUrl: string, orgSlug: string, eventId: string, code: string): string {
  return `${appUrl.replace(/\/$/, "")}/app/${orgSlug}/events/${eventId}/checkin?code=${code}`;
}
