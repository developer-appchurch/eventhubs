"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/datetime";
import { INITIAL_STATE } from "@/lib/errors";
import type { PublicTicket } from "@/modules/events/queries";
import type { FormField } from "@/modules/forms/fields";
import { registerForEvent } from "@/modules/registrations/actions";
import { TICKET_AVAILABILITY_LABELS, ticketAvailability } from "@/modules/registrations/tickets";
import { RegistrationFields } from "./registration-fields";

type Props = {
  orgSlug: string;
  eventSlug: string;
  idempotencyKey: string;
  tickets: PublicTicket[];
  fields: Omit<FormField, "is_active">[];
  hasTerms: boolean;
  paymentsEnabled: boolean;
};

export function RegistrationForm({ orgSlug, eventSlug, idempotencyKey, tickets, fields, hasTerms, paymentsEnabled }: Props) {
  const [state, action, pending] = useActionState(registerForEvent, INITIAL_STATE);
  const available = tickets.filter((t) => ticketAvailability(t, undefined, paymentsEnabled) === "available");
  const errors = state.fieldErrors ?? {};

  // Envio manual: com <form action>, o React limpa os campos ao terminar e o participante
  // perderia o que digitou quando o servidor aponta um erro.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  if (available.length === 0) {
    return <p className="text-sm text-ink-muted">Nenhum ingresso disponível para inscrição online no momento.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div aria-hidden="true" className="hidden">
        <label>
          Não preencha
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <fieldset className="grid gap-2" aria-describedby={errors.ticketTypeId ? "ticket-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">
          Ingresso<span className="text-danger-ink"> *</span>
        </legend>
        {tickets.map((ticket) => {
          const status = ticketAvailability(ticket, undefined, paymentsEnabled);
          const disabled = status !== "available";
          return (
            <label
              key={ticket.id}
              className={`flex items-center justify-between gap-3 rounded-(--radius-control) border border-line p-3 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="ticketTypeId"
                  value={ticket.id}
                  disabled={disabled}
                  defaultChecked={available.length === 1 && !disabled}
                  className="size-4"
                />
                <span>
                  <span className="font-medium">{ticket.name}</span>
                  {disabled ? <span className="block text-xs text-ink-muted">{TICKET_AVAILABILITY_LABELS[status]}</span> : null}
                </span>
              </span>
              <span className="tabular-nums">{ticket.price_cents === 0 ? "Gratuito" : formatCents(ticket.price_cents)}</span>
            </label>
          );
        })}
        {errors.ticketTypeId ? (
          <p id="ticket-error" className="text-sm font-medium text-danger-ink">
            {errors.ticketTypeId}
          </p>
        ) : null}
      </fieldset>

      <RegistrationFields fields={fields} errors={errors} />

      {hasTerms ? (
        <div className="grid gap-1.5">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-1 size-4" aria-invalid={Boolean(errors.acceptTerms) || undefined} />
            <span>
              Li e aceito os termos e orientações do evento<span className="text-danger-ink"> *</span>
            </span>
          </label>
          {errors.acceptTerms ? <p className="text-sm font-medium text-danger-ink">{errors.acceptTerms}</p> : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">
        {pending ? "Enviando inscrição…" : "Confirmar inscrição"}
      </Button>
      {paymentsEnabled && tickets.some((t) => t.price_cents > 0) ? (
        <p className="text-sm text-ink-muted">
          Em ingressos pagos, a vaga fica reservada por 30 minutos e você é levado ao Mercado Pago para pagar. A inscrição é confirmada quando o
          pagamento é aprovado. No cartão parcelado, os juros das parcelas são acrescentados ao valor e informados pelo Mercado Pago antes de
          você confirmar.
        </p>
      ) : null}
    </form>
  );
}
