"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { checkIn, undoCheckIn } from "@/modules/checkins/actions";

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

// Corrige presença lançada na pessoa errada. Duas etapas no próprio lugar, sem modal.
export function UndoCheckInButton({ organizationSlug, eventId, registrationId }: { organizationSlug: string; eventId: string; registrationId: string }) {
  const [state, action, pending] = useActionState(undoCheckIn, INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);
  if (state.ok) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {confirming ? (
        <>
          <Button type="submit" variant="danger" className="min-h-9 px-3" disabled={pending}>
            Desfazer check-in
          </Button>
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirming(false)} disabled={pending}>
            Voltar
          </Button>
        </>
      ) : (
        <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirming(true)}>
          Desfazer
        </Button>
      )}
    </form>
  );
}
