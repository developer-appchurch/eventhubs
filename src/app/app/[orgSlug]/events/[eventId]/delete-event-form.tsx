"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { deleteEvent, duplicateEvent } from "@/modules/events/actions";

export function DeleteEventForm({ organizationSlug, eventId }: { organizationSlug: string; eventId: string }) {
  const [state, action, pending] = useActionState(deleteEvent, INITIAL_STATE);
  return (
    <details className="rounded-(--radius-card) border border-line bg-surface p-5">
      <summary className="cursor-pointer text-sm font-semibold text-danger-ink">Excluir evento</summary>
      <form action={action} className="mt-3 grid max-w-md gap-3">
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="eventId" value={eventId} />
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <p className="text-sm text-ink-muted">Só é possível porque o evento ainda não tem inscrições. Remove o evento, seus ingressos e o formulário. Esta ação não pode ser desfeita.</p>
        <Button type="submit" variant="danger" disabled={pending}>
          Excluir definitivamente
        </Button>
      </form>
    </details>
  );
}

export function DuplicateEventForm({ organizationSlug, eventId }: { organizationSlug: string; eventId: string }) {
  const [state, action, pending] = useActionState(duplicateEvent, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-3 rounded-(--radius-card) border border-line bg-surface p-5">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <p className="text-sm text-ink-muted">
        Cria uma cópia em rascunho com os mesmos dados, ingressos e formulário de inscrição, sem nenhuma inscrição. Depois é só ajustar as datas e publicar.
      </p>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Duplicando…" : "Duplicar evento"}
        </Button>
      </div>
    </form>
  );
}
