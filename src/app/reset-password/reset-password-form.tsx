"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { updatePassword } from "@/modules/auth/actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <TextInput
        name="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
      />
      <TextInput
        name="confirmPassword"
        label="Confirme a nova senha"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
