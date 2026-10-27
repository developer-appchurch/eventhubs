"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { FieldWrapper, inputClass, TextArea, TextInput, useFieldIds } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { DEFAULT_TIMEZONE, formatDate, utcToZonedLocal, zonedLocalToUtc } from "@/lib/datetime";
import { INITIAL_STATE } from "@/lib/errors";
import { createEvent, updateEvent } from "@/modules/events/actions";
import type { EventRecord } from "@/modules/events/queries";
import { EVENT_FORMATS, FORMAT_LABELS, type EventFormat } from "@/modules/events/status";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Formulário de criação e edição, com a pré-visualização da página ao lado. Só datas (sem
// hora), no fuso do evento (o de São Paulo, para eventos novos); o servidor converte para UTC.
// slugLocked: depois de publicado, o endereço não muda.
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
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <form
        action={action}
        className="grid content-start gap-6"
        noValidate
        onInput={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name in values) setValues((v) => ({ ...v, [t.name]: t.value }));
        }}
      >
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="timezone" value={tz} />
        {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

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

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput name="startsAt" label="Data de início" type="date" defaultValue={localDate(event?.starts_at)} required error={errors.startsAt} />
          <TextInput name="endsAt" label="Data de término" type="date" defaultValue={localDate(event?.ends_at)} required error={errors.endsAt} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput name="contactEmail" label="E-mail do organizador" type="email" defaultValue={event?.contact_email ?? ""} error={errors.contactEmail} />
          <TextInput
            name="contactPhone"
            label="WhatsApp do organizador"
            type="tel"
            placeholder="(00) 00000-0000"
            defaultValue={event?.contact_phone ?? ""}
            maxLength={40}
            error={errors.contactPhone}
          />
        </div>

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

        <TextArea
          name="participantTerms"
          label="Termos e orientações ao participante (opcional)"
          rows={3}
          defaultValue={event?.participant_terms}
          maxLength={20000}
          error={errors.participantTerms}
        />

        <SubmitButton pendingLabel="Salvando…">{event ? "Salvar alterações" : "Criar rascunho"}</SubmitButton>
      </form>

      <EventPreview values={values} format={format} isPaid={isPaid} cover={cover} url={prefix + (values.slug || "…")} tz={tz} />
    </div>
  );
}

// Campo do endereço no estilo "https://site/organizacao/[digite aqui]".
function SlugField({ prefix, hint, error, ...props }: { prefix: string; hint: string; error?: string; defaultValue?: string; readOnly?: boolean }) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldWrapper label="Endereço da página do evento" name="slug" hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <div className={`${inputClass(Boolean(error))} flex items-center focus-within:border-brand-500`}>
        <span className="min-w-0 shrink truncate font-medium text-brand-700" aria-hidden>
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

function EventPreview({
  values,
  format,
  isPaid,
  cover,
  url,
  tz,
}: {
  values: Record<string, string>;
  format: EventFormat;
  isPaid: boolean;
  cover: string;
  url: string;
  tz: string;
}) {
  const starts = zonedLocalToUtc(`${values.startsAt}T00:00`, tz);
  const place = format === "online" ? "Online" : [values.venueName, values.address].filter(Boolean).join(" · ");
  return (
    <aside className="hidden self-start lg:sticky lg:top-6 lg:block" aria-label="Pré-visualização da página do evento">
      <p className="mb-2 text-sm font-medium text-ink-muted">Pré-visualização</p>
      <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) ou capa já enviada.
          <img src={cover} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div className="aspect-[3/1] bg-surface-muted" />
        )}
        <div className="grid gap-2 p-4">
          <p className="text-xs font-semibold text-brand-700">
            {FORMAT_LABELS[format]} · {isPaid ? "Pago" : "Gratuito"}
          </p>
          <p className="text-lg font-bold leading-tight">{values.title || "Nome do evento"}</p>
          {starts ? <p className="text-sm text-ink-muted">{formatDate(starts.toISOString(), tz)}</p> : null}
          {place ? <p className="text-sm text-ink">{place}</p> : null}
          {values.description ? <p className="line-clamp-4 whitespace-pre-line text-sm text-ink">{values.description}</p> : null}
          <p className="mt-2 truncate text-xs text-brand-700">{url}</p>
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
