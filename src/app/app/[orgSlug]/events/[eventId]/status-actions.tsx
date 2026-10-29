"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { changeEventStatus } from "@/modules/events/actions";
import { EVENT_TRANSITIONS, transitionLabel, type EventStatus } from "@/modules/events/status";

// Ações de ciclo de vida permitidas a partir do status atual. O banco revalida a transição.
// Cancelar exige confirmação explícita em linha (sem diálogo do navegador).
export function StatusActions({ organizationSlug, eventId, status }: { organizationSlug: string; eventId: string; status: EventStatus }) {
  const [state, action, pending] = useActionState(changeEventStatus, INITIAL_STATE);
  const targets = EVENT_TRANSITIONS[status];
  if (targets.length === 0) return null;

  const hidden = (
    <>
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
    </>
  );

  return (
    <div className="grid gap-3">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-start">
        {targets
          .filter((to) => to !== "cancelled")
          .map((to) => (
            <form key={to} action={action}>
              {hidden}
              <input type="hidden" name="status" value={to} />
              <Button type="submit" variant={to === "published" ? "primary" : "secondary"} disabled={pending} className="w-full sm:w-auto">
                {transitionLabel(status, to)}
              </Button>
            </form>
          ))}
        {targets.includes("cancelled") ? (
          <details className="col-span-2 rounded-(--radius-control) border border-line px-3 py-2 sm:col-span-1">
            <summary className="flex min-h-7 cursor-pointer items-center text-sm font-semibold text-danger-ink">Cancelar evento</summary>
            <form action={action} className="mt-3 grid max-w-md gap-3">
              {hidden}
              <input type="hidden" name="status" value="cancelled" />
              <p className="text-sm text-ink-muted">
                O cancelamento é definitivo: a página pública passa a informar que o evento foi cancelado e o evento não pode mais
                ser editado nem reaberto. Nenhum reembolso é feito automaticamente.
              </p>
              <Button type="submit" variant="danger" disabled={pending}>
                Confirmar cancelamento
              </Button>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}
