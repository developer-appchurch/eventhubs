"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { payRegistration } from "@/modules/registrations/actions";

export function PayButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(payRegistration, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="token" value={token} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Abrindo o Mercado Pago…" : "Pagar com cartão (Mercado Pago)"}
      </Button>
    </form>
  );
}
