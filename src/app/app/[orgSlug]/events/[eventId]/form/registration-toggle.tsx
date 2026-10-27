"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { changeEventStatus } from "@/modules/events/actions";

// Atalho no formulário para abrir/fechar inscrições: troca published <-> registration_closed.
export function RegistrationToggle({ organizationSlug, eventId, open }: { organizationSlug: string; eventId: string; open: boolean }) {
  const [state, action, pending] = useActionState(changeEventStatus, INITIAL_STATE);

  return (
    <form action={action} className="grid gap-3 rounded-(--radius-card) border border-line p-4">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="status" value={open ? "registration_closed" : "published"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">{open ? "Inscrições abertas" : "Inscrições fechadas"}</p>
        <Button type="submit" variant={open ? "secondary" : "primary"} disabled={pending}>
          {open ? "Fechar inscrições" : "Abrir inscrições"}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        {open ? "Qualquer pessoa com o link pode se inscrever." : "A página do evento continua no ar, mas não aceita novas inscrições."}
      </p>
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
    </form>
  );
}
