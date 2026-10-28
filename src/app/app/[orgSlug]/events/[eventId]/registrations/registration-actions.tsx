"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_STATE } from "@/lib/errors";
import { manageRegistration } from "@/modules/registrations/actions";

// Duas etapas, como a exclusão de evento: abrir o painel e então confirmar.
export function RegistrationActions({ organizationSlug, registrationId, active }: { organizationSlug: string; registrationId: string; active: boolean }) {
  const [state, action, pending] = useActionState(manageRegistration, INITIAL_STATE);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <details className="border-t border-line px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-danger-ink">Cancelar ou apagar inscrição</summary>
      <form action={action} className="mt-3 grid max-w-xl gap-3">
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="registrationId" value={registrationId} />
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <p className="text-ink-muted">
          {active ? "Cancelar mantém a inscrição no histórico, com os pagamentos, e libera a vaga e o e-mail. Se houve pagamento, o reembolso é feito no Mercado Pago. " : ""}
          Apagar remove a inscrição de vez e só é possível quando não há nenhum pagamento registrado. As duas ações permitem que a pessoa se inscreva de novo com o mesmo e-mail.
        </p>
        <div className="flex flex-wrap gap-3">
          {active ? (
            <Button type="submit" name="op" value="cancel" variant="secondary" disabled={pending}>
              Cancelar inscrição
            </Button>
          ) : null}
          <Button type="submit" name="op" value="delete" variant="danger" disabled={pending}>
            Apagar definitivamente
          </Button>
        </div>
      </form>
    </details>
  );
}
