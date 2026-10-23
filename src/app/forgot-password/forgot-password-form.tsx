"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { requestPasswordReset } from "@/modules/auth/actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <TextInput name="email" label="E-mail" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <SubmitButton pendingLabel="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}
