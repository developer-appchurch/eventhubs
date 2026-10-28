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

// Mensagem para quem tentou abrir a câmera e não conseguiu (getUserMedia rejeita com DOMException).
export function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Sem permissão para usar a câmera. Libere a câmera para este site nas configurações do navegador e toque em Ler QR Code de novo.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (name === "NotReadableError") return "A câmera está em uso por outro aplicativo. Feche-o e tente de novo.";
  return "Não foi possível abrir a câmera. Use o campo acima para digitar o código.";
}
