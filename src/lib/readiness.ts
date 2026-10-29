export type ReadinessItem = { label: string; done: boolean; href: string; required: boolean };

// O que falta para o evento estar pronto para publicar. "required" não impede a publicação
// (o banco decide); só ordena o aviso: o que quebra a venda vem antes do que melhora a página.
export function publishReadiness(input: {
  base: string;
  settingsHref: string;
  activeTickets: { price_cents: number }[];
  hasDescription: boolean;
  hasCover: boolean;
  paymentsConnected: boolean;
}): ReadinessItem[] {
  const hasPaid = input.activeTickets.some((t) => t.price_cents > 0);
  return [
    { label: "Criar pelo menos um ingresso", done: input.activeTickets.length > 0, href: `${input.base}/tickets`, required: true },
    ...(hasPaid
      ? [{ label: "Conectar o Mercado Pago (há ingresso pago)", done: input.paymentsConnected, href: input.settingsHref, required: true }]
      : []),
    { label: "Escrever a descrição do evento", done: input.hasDescription, href: input.base, required: false },
    { label: "Adicionar uma imagem de capa", done: input.hasCover, href: input.base, required: false },
  ];
}
