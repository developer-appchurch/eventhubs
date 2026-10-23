"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { signUp } from "@/modules/auth/actions";

export function SignupForm() {
  const [state, action] = useActionState(signUp, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <TextInput name="fullName" label="Nome completo" autoComplete="name" required error={state.fieldErrors?.fullName} />
      <TextInput
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <TextInput
        name="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        required
        hint="Use pelo menos 8 caracteres."
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}
