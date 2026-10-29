import { Card } from "@/components/ui/card";

// Aparece na hora do clique e permite ao Next pré-carregar as subtelas; cabeçalho e Voltar/Avançar ficam no layout.
export default function Loading() {
  return (
    <Card>
      <div role="status" className="grid animate-pulse gap-4">
        <span className="sr-only">Carregando…</span>
        <div className="h-5 w-48 rounded bg-surface-muted" />
        <div className="h-4 w-full rounded bg-surface-muted" />
        <div className="h-4 w-5/6 rounded bg-surface-muted" />
        <div className="h-4 w-2/3 rounded bg-surface-muted" />
      </div>
    </Card>
  );
}
