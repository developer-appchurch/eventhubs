"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { payWithPix } from "@/modules/registrations/actions";

export function PixPayment({ token }: { token: string }) {
  const [state, action, pending] = useActionState(payWithPix, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="token" value={token} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Button type="submit" disabled={pending} className="min-h-12 w-full text-base sm:w-auto">
        {pending ? "Abrindo o Pix…" : "Pagar com Pix"}
      </Button>
    </form>
  );
}
