"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { disconnectPaymentAccount } from "@/modules/payments/actions";

// Duas etapas no próprio lugar, sem modal: desconectar para a venda de ingressos pagos.
export function DisconnectPaymentsButton({ organizationSlug }: { organizationSlug: string }) {
  const [state, action, pending] = useActionState(disconnectPaymentAccount, INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {confirming ? (
        <>
          <p className="font-medium">Ingressos pagos deixam de aceitar inscrição até outra conta ser conectada. Pagamentos já feitos não mudam.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Confirmar desconexão
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Voltar
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          Desconectar conta Mercado Pago
        </Button>
      )}
    </form>
  );
}
