"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { checkIn } from "@/modules/checkins/actions";

// Confirmação explícita: abrir o link do QR só mostra a inscrição; a presença é registrada aqui.
export function CheckInButton({
  organizationSlug,
  eventId,
  code,
  registrationId,
  label = "Confirmar presença",
}: {
  organizationSlug: string;
  eventId: string;
  code?: string;
  registrationId?: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(checkIn, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      {code ? <input type="hidden" name="code" value={code} /> : null}
      {registrationId ? <input type="hidden" name="registrationId" value={registrationId} /> : null}
      {state.message ? <Alert tone={state.ok ? "success" : "warning"}>{state.message}</Alert> : null}
      {state.ok ? null : (
        <Button type="submit" disabled={pending}>
          {label}
        </Button>
      )}
    </form>
  );
}
