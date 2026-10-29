"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { INITIAL_STATE } from "@/lib/errors";
import { manageRegistration } from "@/modules/registrations/actions";

// Botão lateral na linha da inscrição. Duas etapas no próprio lugar: Excluir e então confirmar.
export function RegistrationActions({ organizationSlug, registrationId, active }: { organizationSlug: string; registrationId: string; active: boolean }) {
  const [state, action, pending] = useActionState(manageRegistration, INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="grid max-w-xs justify-items-end gap-2 text-sm">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="registrationId" value={registrationId} />
      {confirming ? (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="submit" name="op" value="delete" variant="danger" className="min-h-9 px-3" disabled={pending}>
              Apagar
            </Button>
            {active ? (
              <Button type="submit" name="op" value="cancel" variant="secondary" className="min-h-9 px-3" disabled={pending}>
                Só cancelar
              </Button>
            ) : null}
            <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirming(false)} disabled={pending}>
              Voltar
            </Button>
          </div>
          <p className="text-right text-xs text-ink-muted">
            Apagar remove de vez (só sem pagamento).{active ? " Cancelar libera a vaga e mantém o histórico." : ""}
          </p>
        </>
      ) : (
        <Button variant="ghost" className="min-h-9 px-3 text-danger-ink hover:bg-danger-ink/10" onClick={() => setConfirming(true)} aria-label="Excluir inscrição">
          <Icon name="trash" className="size-4" />
          <span className="hidden sm:inline">Excluir</span>
        </Button>
      )}
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
    </form>
  );
}
