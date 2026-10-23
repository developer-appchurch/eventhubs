"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { DEFAULT_TIMEZONE, EVENT_TIMEZONES, utcToZonedLocal } from "@/lib/datetime";
import { INITIAL_STATE } from "@/lib/errors";
import { createEvent, updateEvent } from "@/modules/events/actions";
import type { EventRecord } from "@/modules/events/queries";
import { EVENT_FORMATS, FORMAT_LABELS, type EventFormat } from "@/modules/events/status";

// Formulário de criação e edição. Datas são digitadas no fuso do evento; o servidor converte
// para UTC. slugLocked: depois de publicado, o endereço não muda.
export function EventForm({
  organizationSlug,
  event,
  slugLocked = false,
}: {
  organizationSlug: string;
  event?: EventRecord;
  slugLocked?: boolean;
}) {
  const [state, action] = useActionState(event ? updateEvent : createEvent, INITIAL_STATE);
  const [format, setFormat] = useState<EventFormat>(event?.format ?? "in_person");
  const errors = state.fieldErrors ?? {};
  const tz = event?.timezone ?? DEFAULT_TIMEZONE;
  const local = (iso?: string) => utcToZonedLocal(iso, tz);

  return (
    <form action={action} className="grid gap-8" noValidate>
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Informações principais</legend>
        <TextInput name="title" label="Nome do evento" defaultValue={event?.title} required maxLength={140} error={errors.title} />
        <TextInput
          name="slug"
          label="Endereço do evento"
          defaultValue={event?.slug}
          readOnly={slugLocked}
          maxLength={60}
          hint={
            slugLocked
              ? "O endereço não muda depois da publicação, para não quebrar links já divulgados."
              : `Fica em /${organizationSlug}/<endereço>. Deixe em branco para gerar a partir do nome.`
          }
          error={errors.slug}
        />
        <TextArea name="description" label="Descrição" defaultValue={event?.description} maxLength={20000} error={errors.description} />
        <TextInput
          name="coverImageUrl"
          label="Imagem de capa (URL)"
          type="url"
          defaultValue={event?.cover_image_url ?? ""}
          placeholder="https://"
          hint="Endereço https de uma imagem já publicada. Proporção recomendada 3:1."
          error={errors.coverImageUrl}
        />
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Local</legend>
        <SelectInput name="format" label="Formato" value={format} onChange={(e) => setFormat(e.target.value as EventFormat)} error={errors.format}>
          {EVENT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </SelectInput>
        {format !== "online" ? (
          <>
            <TextInput name="venueName" label="Nome do local" defaultValue={event?.venue_name} maxLength={160} required error={errors.venueName} />
            <TextInput name="address" label="Endereço" defaultValue={event?.address} maxLength={300} error={errors.address} />
          </>
        ) : null}
        {format !== "in_person" ? (
          <TextInput
            name="onlineUrl"
            label="Link de acesso online"
            type="url"
            defaultValue={event?.online_url ?? ""}
            placeholder="https://"
            hint="Não aparece na página pública. Será enviado aos inscritos."
            error={errors.onlineUrl}
          />
        ) : null}
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Datas e vagas</legend>
        <SelectInput name="timezone" label="Fuso horário do evento" defaultValue={tz} error={errors.timezone}>
          {EVENT_TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectInput>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput name="startsAt" label="Início" type="datetime-local" defaultValue={local(event?.starts_at)} required error={errors.startsAt} />
          <TextInput name="endsAt" label="Término" type="datetime-local" defaultValue={local(event?.ends_at)} required error={errors.endsAt} />
          <TextInput
            name="registrationOpensAt"
            label="Abertura das inscrições"
            type="datetime-local"
            defaultValue={local(event?.registration_opens_at)}
            required
            error={errors.registrationOpensAt}
          />
          <TextInput
            name="registrationClosesAt"
            label="Encerramento das inscrições"
            type="datetime-local"
            defaultValue={local(event?.registration_closes_at)}
            required
            error={errors.registrationClosesAt}
          />
        </div>
        <TextInput
          name="capacity"
          label="Capacidade total"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={event?.capacity}
          required
          hint="Vagas compartilhadas por todos os tipos de ingresso."
          error={errors.capacity}
        />
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Contato e orientações</legend>
        <p className="text-sm text-ink-muted">O contato aparece na página pública do evento.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput name="contactEmail" label="E-mail de contato" type="email" defaultValue={event?.contact_email ?? ""} error={errors.contactEmail} />
          <TextInput name="contactPhone" label="Telefone de contato" type="tel" defaultValue={event?.contact_phone ?? ""} maxLength={40} error={errors.contactPhone} />
        </div>
        <TextArea
          name="participantTerms"
          label="Termos e orientações ao participante"
          defaultValue={event?.participant_terms}
          maxLength={20000}
          error={errors.participantTerms}
        />
      </fieldset>

      <SubmitButton pendingLabel="Salvando…">{event ? "Salvar alterações" : "Criar rascunho"}</SubmitButton>
    </form>
  );
}
