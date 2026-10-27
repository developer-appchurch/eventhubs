"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
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
      <form action={action} className="grid gap-4" noValidate>
        {hidden}
        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <TextInput id={`${p}-name`} name="name" label="Nome" placeholder="Ex.: Inteira, Meia, Lote 1" defaultValue={ticket?.name} required maxLength={80} error={errors.name} />
          <TextInput
            id={`${p}-price`}
            name="price"
            label="Preço (R$)"
            inputMode="decimal"
            defaultValue={ticket ? centsToInput(ticket.price_cents) : "0,00"}
            hint="0,00 = gratuito"
            error={errors.price}
          />
          <TextInput
            id={`${p}-quantityLimit`}
            name="quantityLimit"
            label="Vagas"
            type="number"
            min={1}
            placeholder="Sem limite"
            defaultValue={ticket?.quantity_limit ?? ""}
            hint="Dentro da capacidade do evento"
            error={errors.quantityLimit}
          />
        </div>
        {/* Aberto quando já há valor ou erro nesses campos, para nada ficar escondido. */}
        <details
          open={Boolean(ticket?.sales_start_at || ticket?.sales_end_at || errors.salesStartAt || errors.salesEndAt || errors.minPerOrder || errors.maxPerOrder) || undefined}
          className="rounded-(--radius-control) border border-line px-3 py-2"
        >
          <summary className="flex min-h-7 cursor-pointer items-center text-sm font-semibold">Período de vendas e limite por pedido</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextInput
              id={`${p}-salesStartAt`}
              name="salesStartAt"
              label="Vendas começam"
              type="datetime-local"
              defaultValue={utcToZonedLocal(ticket?.sales_start_at, timezone)}
              hint="Em branco: segue a data do evento"
              error={errors.salesStartAt}
            />
            <TextInput
              id={`${p}-salesEndAt`}
              name="salesEndAt"
              label="Vendas terminam"
              type="datetime-local"
              defaultValue={utcToZonedLocal(ticket?.sales_end_at, timezone)}
              hint="Em branco: até o fim do evento"
              error={errors.salesEndAt}
            />
            <TextInput id={`${p}-min`} name="minPerOrder" label="Mínimo por pedido" type="number" min={1} defaultValue={ticket?.min_per_order ?? 1} error={errors.minPerOrder} />
            <TextInput id={`${p}-max`} name="maxPerOrder" label="Máximo por pedido" type="number" min={1} max={50} defaultValue={ticket?.max_per_order ?? 1} error={errors.maxPerOrder} />
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="isActive" defaultChecked={ticket?.is_active ?? true} className="size-4" />
            Ativo (aparece na página pública)
          </label>
          <SubmitButton pendingLabel="Salvando…">{ticket ? "Salvar ingresso" : "Adicionar ingresso"}</SubmitButton>
        </div>
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
