"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { updateProfile } from "@/modules/auth/actions";

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const [state, action] = useActionState(updateProfile, INITIAL_STATE);
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <TextInput name="fullName" label="Nome completo" defaultValue={initialName} required error={state.fieldErrors?.fullName} autoComplete="name" />
      <TextInput name="email" label="E-mail de acesso" value={email} readOnly hint="A troca de e-mail chega em uma próxima etapa." />
      <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
    </form>
  );
}
