"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { utcToZonedLocal } from "@/lib/datetime";
import { INITIAL_STATE } from "@/lib/errors";
import type { TicketType } from "@/modules/events/queries";
import { deleteTicketType, saveTicketType } from "@/modules/ticket-types/actions";

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function TicketForm({
  organizationSlug,
  eventId,
  timezone,
  ticket,
}: {
  organizationSlug: string;
  eventId: string;
  timezone: string;
  ticket?: TicketType;
}) {
  const [state, action] = useActionState(saveTicketType, INITIAL_STATE);
  const [deleteState, deleteAction, deleting] = useActionState(deleteTicketType, INITIAL_STATE);
  const errors = state.fieldErrors ?? {};
  // Ids únicos por formulário: vários formulários de ingresso convivem na mesma página.
  const p = ticket?.id ?? "new";

  const hidden = (
    <>
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      {ticket ? <input type="hidden" name="ticketId" value={ticket.id} /> : null}
    </>
  );

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-5" noValidate>
        {hidden}
        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id={`${p}-name`} name="name" label="Nome" defaultValue={ticket?.name} required maxLength={80} error={errors.name} />
          <TextInput
            id={`${p}-price`}
            name="price"
            label="Preço (R$)"
            inputMode="decimal"
            defaultValue={ticket ? centsToInput(ticket.price_cents) : "0,00"}
            hint="Use 0,00 para gratuito. Pagamentos online chegam numa próxima etapa."
            error={errors.price}
          />
        </div>
        <TextArea id={`${p}-description`} name="description" label="Descrição" defaultValue={ticket?.description} maxLength={1000} error={errors.description} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            id={`${p}-salesStartAt`}
            name="salesStartAt"
            label="Início das vendas (opcional)"
            type="datetime-local"
            defaultValue={utcToZonedLocal(ticket?.sales_start_at, timezone)}
            error={errors.salesStartAt}
          />
          <TextInput
            id={`${p}-salesEndAt`}
            name="salesEndAt"
            label="Fim das vendas (opcional)"
            type="datetime-local"
            defaultValue={utcToZonedLocal(ticket?.sales_end_at, timezone)}
            error={errors.salesEndAt}
          />
          <TextInput
            id={`${p}-quantityLimit`}
            name="quantityLimit"
            label="Limite deste ingresso (opcional)"
            type="number"
            min={1}
            defaultValue={ticket?.quantity_limit ?? ""}
            hint="Teto próprio deste tipo. A capacidade total do evento continua valendo para todos."
            error={errors.quantityLimit}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextInput id={`${p}-min`} name="minPerOrder" label="Mín. por pedido" type="number" min={1} defaultValue={ticket?.min_per_order ?? 1} error={errors.minPerOrder} />
            <TextInput id={`${p}-max`} name="maxPerOrder" label="Máx. por pedido" type="number" min={1} max={50} defaultValue={ticket?.max_per_order ?? 1} error={errors.maxPerOrder} />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="isActive" defaultChecked={ticket?.is_active ?? true} className="size-4" />
          Ativo (aparece na página pública)
        </label>
        <SubmitButton pendingLabel="Salvando…">{ticket ? "Salvar ingresso" : "Adicionar ingresso"}</SubmitButton>
      </form>

      {ticket ? (
        <form action={deleteAction} className="grid gap-2 border-t border-line pt-4">
          {hidden}
          {deleteState.message && !deleteState.ok ? <Alert tone="danger">{deleteState.message}</Alert> : null}
          <Button type="submit" variant="ghost" disabled={deleting} className="justify-self-start text-danger-ink">
            Excluir ingresso
          </Button>
        </form>
      ) : null}
    </div>
  );
}
