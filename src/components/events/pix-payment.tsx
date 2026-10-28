"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { payWithPix, type PixState } from "@/modules/registrations/actions";

export function PixPayment({ token }: { token: string }) {
  const [state, action, pending] = useActionState(payWithPix, { ok: false } as PixState);
  if (state.code && state.qrSvg) return <PixCode code={state.code} qrSvg={state.qrSvg} />;

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="token" value={token} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Button type="submit" disabled={pending} className="min-h-12 w-full text-base sm:w-auto">
        {pending ? "Gerando o Pix…" : "Pagar com Pix"}
      </Button>
    </form>
  );
}

export function PixCode({ code, qrSvg }: { code: string; qrSvg: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">
        No app do seu banco, escolha <strong className="text-ink">Pix</strong> e leia o QR Code ou use o código copia e cola.
      </p>
      {/* SVG gerado no servidor pela biblioteca a partir do código do Mercado Pago. */}
      <div
        role="img"
        aria-label="QR Code do Pix"
        className="mx-auto aspect-square w-full max-w-64 rounded-lg bg-white p-2 ring-1 ring-line [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <Button
        className="min-h-12 w-full text-base"
        onClick={() =>
          navigator.clipboard.writeText(code).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? "Código copiado!" : "Copiar código Pix"}
      </Button>
      <p aria-live="polite" className="text-center text-sm text-ink-muted empty:hidden">
        {copied === false ? "Não foi possível copiar. Toque no código abaixo, selecione e copie." : null}
      </p>
      <p className="max-h-24 overflow-y-auto rounded-(--radius-control) bg-surface-muted p-3 font-mono text-xs break-all select-all">{code}</p>
      <Button variant="secondary" className="w-full" onClick={() => window.location.reload()}>
        Já paguei, atualizar a página
      </Button>
    </div>
  );
}
