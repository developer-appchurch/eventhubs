"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { updateOrganization } from "@/modules/organizations/actions";

export function OrganizationSettingsForm({ organizationSlug, initialName }: { organizationSlug: string; initialName: string }) {
  const [state, action] = useActionState(updateOrganization, INITIAL_STATE);
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <TextInput name="name" label="Nome da organização" defaultValue={initialName} required error={state.fieldErrors?.name} />
      <SubmitButton pendingLabel="Salvando…">Salvar alterações</SubmitButton>
    </form>
  );
}
