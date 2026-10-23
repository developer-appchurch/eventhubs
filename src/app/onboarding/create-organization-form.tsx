"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { createOrganization } from "@/modules/organizations/actions";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganization, INITIAL_STATE);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // O identificador acompanha o nome até o usuário editá-lo manualmente.
  const suggestedSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <TextInput
        name="name"
        label="Nome da organização"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="organization"
        error={state.fieldErrors?.name}
      />
      <TextInput
        name="slug"
        label="Endereço público"
        required
        value={suggestedSlug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(slugify(event.target.value));
        }}
        hint="Aparecerá nos links dos seus eventos. Use letras minúsculas, números e hífens."
        error={state.fieldErrors?.slug}
        spellCheck={false}
      />
      <SubmitButton pendingLabel="Criando organização…">Criar organização</SubmitButton>
    </form>
  );
}
