"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { PublicEventView } from "@/components/events/public-event-view";
import { Alert } from "@/components/ui/alert";
import { FormSection } from "@/components/ui/card";
import { FieldWrapper, inputClass, TextArea, TextInput, useFieldIds } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { DEFAULT_TIMEZONE, utcToZonedLocal, zonedLocalToUtc } from "@/lib/datetime";
import { INITIAL_STATE } from "@/lib/errors";
import { maskPhone } from "@/lib/phone";
import { createEvent, updateEvent } from "@/modules/events/actions";
import type { EventRecord, PublicTicket } from "@/modules/events/queries";
import { EVENT_FORMATS, FORMAT_LABELS, type EventFormat } from "@/modules/events/status";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Formulário de criação e edição, com a pré-visualização da página ao lado. Só datas (sem
// hora), no fuso do evento (o de São Paulo, para eventos novos); o servidor converte para UTC.
// slugLocked: depois de publicado, o endereço não muda.
export function EventForm({
  organizationSlug,
  organizationName,
  event,
  tickets = [],
  slugLocked = false,
  defaultContactEmail = "",
}: {
  organizationSlug: string;
  organizationName: string;
  event?: EventRecord;
  tickets?: PublicTicket[];
  slugLocked?: boolean;
  defaultContactEmail?: string;
}) {
  const [state, action] = useActionState(event ? updateEvent : createEvent, INITIAL_STATE);
  const [format, setFormat] = useState<EventFormat>(event?.format ?? "in_person");
  const [isPaid, setIsPaid] = useState(event?.is_paid ?? false);
  const [cover, setCover] = useState(event?.cover_image_url ?? "");
  const tz = event?.timezone ?? DEFAULT_TIMEZONE;
  const localDate = (iso?: string) => utcToZonedLocal(iso, tz).slice(0, 10);
  const [values, setValues] = useState<Record<string, string>>({
    title: event?.title ?? "",
    slug: event?.slug ?? "",
    description: event?.description ?? "",
    venueName: event?.venue_name ?? "",
    address: event?.address ?? "",
    startsAt: localDate(event?.starts_at),
    endsAt: localDate(event?.ends_at),
    capacity: String(event?.capacity ?? ""),
    contactEmail: event ? (event.contact_email ?? "") : defaultContactEmail,
    contactPhone: maskPhone(event?.contact_phone ?? ""),
    participantTerms: event?.participant_terms ?? "",
  });
  const errors = state.fieldErrors ?? {};
  const prefix = `${APP_URL}/${organizationSlug}/`;

  // Reduz a foto no navegador (largura máx. 1600px, WebP quando suportado) antes de enviar.
  // O servidor regrava em WebP de qualquer forma; aqui é só para o upload ficar leve.
  async function pickCover(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const small = await shrinkImage(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      input.files = dt.files;
      setCover(URL.createObjectURL(small));
    } catch {
      setCover(URL.createObjectURL(file));
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_auto]">
      <form
        action={action}
        className="grid content-start gap-8"
        noValidate
        onInput={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name in values) setValues((v) => ({ ...v, [t.name]: t.name === "contactPhone" ? maskPhone(t.value) : t.value }));
        }}
      >
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="timezone" value={tz} />
        {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

        <FormSection title="Informações principais" description="Como o evento aparece para o público.">
        <SlugField
          prefix={prefix}
          defaultValue={event?.slug}
          readOnly={slugLocked}
          hint={
            slugLocked
              ? "O endereço não muda depois da publicação, para não quebrar links já divulgados."
              : "É o link que você vai enviar para as pessoas se inscreverem. Em branco, usamos o nome do evento."
          }
          error={errors.slug}
        />
        <TextInput name="title" label="Nome do evento" defaultValue={event?.title} required maxLength={140} error={errors.title} />
        <TextArea name="description" label="Breve descrição" rows={3} defaultValue={event?.description} maxLength={20000} error={errors.description} />
        <TextInput
          name="coverImage"
          label="Imagem de capa"
          type="file"
          accept="image/*"
          onChange={pickCover}
          className="text-sm file:mr-3 file:rounded-(--radius-control) file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700"
          hint={event?.cover_image_url ? "Escolha outra foto para trocar a capa atual." : "Proporção recomendada 3:1. A foto é convertida para WebP."}
          error={errors.coverImage}
        />

        </FormSection>

        <FormSection title="Data e local" description="Quando e onde o evento acontece.">
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <DateField name="startsAt" label="Data de início" value={values.startsAt} error={errors.startsAt} />
          <DateField name="endsAt" label="Data de término" value={values.endsAt} error={errors.endsAt} />
        </div>

        <Segmented
          legend="Local"
          name="format"
          options={EVENT_FORMATS.map((f) => [f, FORMAT_LABELS[f]])}
          value={format}
          onChange={(v) => setFormat(v as EventFormat)}
          error={errors.format}
        />
        {format !== "online" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput name="venueName" label="Nome do local" defaultValue={event?.venue_name} maxLength={160} required error={errors.venueName} />
            <TextInput name="address" label="Endereço" defaultValue={event?.address} maxLength={300} error={errors.address} />
          </div>
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

        </FormSection>

        <FormSection title="Inscrições e vagas" description="Tipo de inscrição, capacidade e abertura das vendas.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            legend="Inscrição"
            name="isPaid"
            options={[
              ["false", "Gratuita"],
              ["true", "Paga"],
            ]}
            value={String(isPaid)}
            onChange={(v) => setIsPaid(v === "true")}
            error={errors.isPaid}
          />
          <TextInput
            name="capacity"
            label="Vagas"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={event?.capacity}
            required
            error={errors.capacity}
          />
        </div>

        <TextInput
          name="salesStartAt"
          label="Vendas a partir de (opcional)"
          type="datetime-local"
          defaultValue={utcToZonedLocal(event?.sales_start_at, tz)}
          hint="Vale para todos os ingressos. Em branco, as vendas abrem assim que o evento for publicado. Cada lote pode ter a sua própria data."
          error={errors.salesStartAt}
        />

        </FormSection>

        <FormSection title="Contato do organizador" description="Exibido na página pública do evento.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput name="contactEmail" label="E-mail do organizador" type="email" defaultValue={values.contactEmail} error={errors.contactEmail} />
          <TextInput
            name="contactPhone"
            label="WhatsApp do organizador"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 91234-5678"
            value={values.contactPhone}
            onChange={() => {}} // a máscara é aplicada no onInput do formulário
            maxLength={15}
            error={errors.contactPhone}
          />
        </div>

        </FormSection>

        <FormSection title="Termos" description="Orientações que o participante lê antes de se inscrever.">
        <TextArea
          name="participantTerms"
          label="Termos e orientações ao participante (opcional)"
          rows={3}
          defaultValue={event?.participant_terms}
          maxLength={20000}
          error={errors.participantTerms}
        />

        </FormSection>

        <div className="sticky bottom-0 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
          <SubmitButton pendingLabel="Salvando…">{event ? "Salvar alterações" : "Criar rascunho"}</SubmitButton>
        </div>
      </form>

      <PhonePreview
        organization={{ name: organizationName, slug: organizationSlug }}
        status={event?.status ?? "draft"}
        tickets={tickets}
        values={values}
        format={format}
        cover={cover}
        url={prefix + (values.slug || "…")}
        tz={tz}
      />
    </div>
  );
}

// No celular o iPhone mostra a data por extenso ("28 de out. de 2026") e não cabe lado a lado:
// lá aparece 28/10/2026 e o campo nativo fica transparente por cima, abrindo o calendário ao tocar.
function DateField({ name, label, value, error }: { name: string; label: string; value: string; error?: string }) {
  const ids = useFieldIds(undefined, error);
  return (
    <FieldWrapper label={label} name={name} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="date"
          defaultValue={value}
          required
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={ids.describedBy}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {} // sem suporte: o toque já abre o seletor nativo
          }}
          className={`peer ${inputClass(Boolean(error))} max-sm:absolute max-sm:inset-0 max-sm:opacity-0`}
        />
        <span aria-hidden className={`${inputClass(Boolean(error))} flex items-center tabular-nums peer-focus:border-brand-600 sm:hidden`}>
          {value ? value.split("-").reverse().join("/") : "dd/mm/aaaa"}
        </span>
      </div>
    </FieldWrapper>
  );
}

// Campo do endereço no estilo "https://site/organizacao/[digite aqui]".
function SlugField({ prefix, hint, error, ...props }: { prefix: string; hint: string; error?: string; defaultValue?: string; readOnly?: boolean }) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldWrapper label="Endereço da página do evento" name="slug" hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <div className={`${inputClass(Boolean(error))} flex items-center focus-within:border-brand-500`}>
        <span className="min-w-0 max-w-1/2 shrink truncate font-medium text-brand-700" aria-hidden>
          {prefix}
        </span>
        <input
          id="slug"
          name="slug"
          maxLength={60}
          placeholder="digite aqui"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={ids.describedBy}
          className="min-h-10 min-w-24 flex-1 bg-transparent outline-none read-only:text-ink-muted"
          {...props}
        />
      </div>
    </FieldWrapper>
  );
}

// Opções lado a lado (rádios com cara de botão): uma escolha visível, sem abrir lista.
function Segmented({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className="flex gap-2">
        {options.map(([v, label]) => (
          <label
            key={v}
            className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-(--radius-control) border border-line-strong bg-surface px-3 text-sm font-medium has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-500"
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm font-medium text-danger-ink">{error}</p> : null}
    </fieldset>
  );
}

// A página pública de verdade (mesmo componente), montada com o que está sendo digitado,
// dentro de um celular. A inscrição aparece só na aba Pré-visualizar, que usa o formulário salvo.
function PhonePreview({
  organization,
  status,
  tickets,
  values,
  format,
  cover,
  url,
  tz,
}: {
  organization: { name: string; slug: string };
  status: EventRecord["status"];
  tickets: PublicTicket[];
  values: Record<string, string>;
  format: EventFormat;
  cover: string;
  url: string;
  tz: string;
}) {
  const startsAt = (zonedLocalToUtc(`${values.startsAt}T00:00`, tz) ?? new Date()).toISOString();
  const endsAt = (zonedLocalToUtc(`${values.endsAt || values.startsAt}T23:59`, tz) ?? new Date(startsAt)).toISOString();
  const capacity = Math.max(Number(values.capacity) || 0, 0);
  return (
    <aside className="hidden self-start xl:sticky xl:top-6 xl:block" aria-label="Pré-visualização da página do evento no celular">
      <p className="mb-2 text-sm font-medium text-ink-muted">Como fica no celular</p>
      <div className="w-[22rem] rounded-[2.75rem] border-[10px] border-ink bg-ink p-0 shadow-xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-canvas">
          <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" aria-hidden />
          <p className="truncate border-b border-line bg-surface px-4 pt-9 pb-2 text-center text-[11px] text-ink-muted">{url}</p>
          <div className="h-[36rem] overflow-y-auto overscroll-contain px-4 py-4">
            <PublicEventView
              data={{
                organization,
                payments_enabled: true,
                tickets,
                form: null,
                event: {
                  id: "",
                  slug: values.slug,
                  title: values.title || "Nome do evento",
                  description: values.description,
                  cover_image_url: cover || null,
                  format,
                  venue_name: values.venueName,
                  address: values.address,
                  starts_at: startsAt,
                  ends_at: endsAt,
                  timezone: tz,
                  capacity,
                  remaining: capacity,
                  contact_email: values.contactEmail || null,
                  contact_phone: values.contactPhone || null,
                  participant_terms: values.participantTerms,
                  status,
                },
              }}
              registration={<p className="text-sm text-ink-muted">O formulário de inscrição aparece aqui. Teste-o na aba Pré-visualizar.</p>}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  // Safari não gera WebP no canvas (devolve PNG); nesse caso vai JPEG e o servidor converte.
  let blob = await encode("image/webp");
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("encode");
  return new File([blob], blob.type === "image/webp" ? "capa.webp" : "capa.jpg", { type: blob.type });
}
