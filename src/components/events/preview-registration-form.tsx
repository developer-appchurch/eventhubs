"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import type { FormField } from "@/modules/forms/fields";
import { testFormAnswers } from "@/modules/forms/actions";
import { RegistrationFields } from "./registration-fields";

// Formulário de inscrição na pré-visualização: valida no servidor, mas não grava nada.
export function PreviewRegistrationForm({ eventId, fields }: { eventId: string; fields: Omit<FormField, "is_active">[] }) {
  const [state, action] = useActionState(testFormAnswers, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <RegistrationFields fields={fields} errors={state.fieldErrors} />
      <SubmitButton pendingLabel="Validando…">Testar validação</SubmitButton>
    </form>
  );
}
