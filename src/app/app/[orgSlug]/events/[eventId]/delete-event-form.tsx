"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { deleteEvent } from "@/modules/events/actions";

export function DeleteEventForm({ organizationSlug, eventId }: { organizationSlug: string; eventId: string }) {
  const [state, action, pending] = useActionState(deleteEvent, INITIAL_STATE);
  return (
    <details className="rounded-(--radius-card) border border-line bg-surface p-5">
      <summary className="cursor-pointer text-sm font-semibold text-danger-ink">Excluir rascunho</summary>
      <form action={action} className="mt-3 grid max-w-md gap-3">
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="eventId" value={eventId} />
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <p className="text-sm text-ink-muted">Remove o rascunho, seus ingressos e o formulário. Esta ação não pode ser desfeita.</p>
        <Button type="submit" variant="danger" disabled={pending}>
          Excluir definitivamente
        </Button>
      </form>
    </details>
  );
}
