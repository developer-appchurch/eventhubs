"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { signIn, signInWithGoogle } from "@/modules/auth/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, INITIAL_STATE);
  return (
    <div className="grid gap-6">
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
    <div className="grid gap-3">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>
      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" className="w-full">
          Continuar com Google
        </Button>
      </form>
    </div>
    </div>
  );
}