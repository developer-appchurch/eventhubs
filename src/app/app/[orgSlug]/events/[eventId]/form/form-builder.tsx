"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { saveEventForm } from "@/modules/forms/actions";
import {
  bankFieldKey,
  bankQuestionToField,
  CHOICE_TYPES,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  fieldKeyFromLabel,
  IDENTITY_TYPES,
  type BankQuestion,
  type FieldType,
  type FormField,
} from "@/modules/forms/fields";

const ADDABLE_TYPES = FIELD_TYPES.filter((t) => !IDENTITY_TYPES.includes(t));
const LIMIT_TYPES: readonly FieldType[] = ["short_text", "long_text", "number"];

// Construtor do formulário de inscrição. Edita a lista localmente e envia tudo de uma vez;
// o servidor valida e grava uma nova versão. Nome e e-mail são fixos e obrigatórios.
// Perguntas do banco: as "sempre" entram ativas e obrigatórias; as demais ligam e desligam.
export function FormBuilder({
  organizationSlug,
  eventId,
  initialFields,
  bank,
}: {
  organizationSlug: string;
  eventId: string;
  initialFields: FormField[];
  bank: BankQuestion[];
}) {
  const [state, action] = useActionState(saveEventForm, INITIAL_STATE);
  const lockedKeys = bank.filter((q) => q.always_on).map((q) => bankFieldKey(q.id));
  const [fields, setFields] = useState(() => {
    const list = initialFields.map((f) => (lockedKeys.includes(f.key) ? { ...f, required: true, is_active: true } : f));
    const missing = bank.filter((q) => q.always_on && !list.some((f) => f.key === bankFieldKey(q.id)));
    return [...list, ...missing.map(bankQuestionToField)];
  });
  // Ids gerados aqui para perguntas novas do banco; o servidor as cria ao salvar.
  const [newBankIds, setNewBankIds] = useState<string[]>([]);
  const saveToBank = (index: number) => {
    const id = crypto.randomUUID();
    setNewBankIds((ids) => [...ids, id]);
    update(index, { key: bankFieldKey(id) });
  };
  const toggleBank = (q: BankQuestion, on: boolean) =>
    setFields((list) =>
      list.some((f) => f.key === bankFieldKey(q.id))
        ? list.map((f) => (f.key === bankFieldKey(q.id) ? { ...f, is_active: on } : f))
        : on
          ? [...list, bankQuestionToField(q)]
          : list,
    );
  const [newType, setNewType] = useState<FieldType>("short_text");

  const update = (index: number, patch: Partial<FormField>) => setFields((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const move = (index: number, delta: number) =>
    setFields((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const add = () =>
    setFields((list) => {
      const label = FIELD_TYPE_LABELS[newType];
      return [
        ...list,
        {
          key: fieldKeyFromLabel(label, list.map((f) => f.key)),
          label,
          type: newType,
          required: false,
          options: CHOICE_TYPES.includes(newType) ? ["Opção 1", "Opção 2"] : [],
          validation: {},
          help_text: "",
          placeholder: "",
          is_active: true,
        },
      ];
    });

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />
      <input type="hidden" name="newBankIds" value={JSON.stringify(newBankIds)} />
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

      <ol className="grid gap-4">
        {fields.map((field, index) => {
          const identity = IDENTITY_TYPES.includes(field.type);
          const locked = identity || lockedKeys.includes(field.key);
          const id = (part: string) => `field-${field.key}-${part}`;
          return (
            <li key={field.key} className={`grid gap-4 rounded-(--radius-card) border border-line bg-surface p-4 ${field.is_active ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {index + 1}. {FIELD_TYPE_LABELS[field.type]}
                  <span className="ml-2 font-normal text-ink-muted">({field.key})</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Mover ${field.label} para cima`}>
                    ↑
                  </Button>
                  <Button variant="ghost" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label={`Mover ${field.label} para baixo`}>
                    ↓
                  </Button>
                  {locked || field.key.startsWith("q_") ? null : (
                    <Button variant="ghost" onClick={() => saveToBank(index)}>
                      Salvar no banco
                    </Button>
                  )}
                  {locked ? null : (
                    <Button variant="ghost" className="text-danger-ink" onClick={() => setFields((list) => list.filter((_, i) => i !== index))}>
                      Remover
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor={id("label")} className="text-sm font-medium">Rótulo</label>
                  <input id={id("label")} className={inputClass()} value={field.label} maxLength={120} onChange={(e) => update(index, { label: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={id("help")} className="text-sm font-medium">Texto de ajuda</label>
                  <input id={id("help")} className={inputClass()} value={field.help_text} maxLength={300} onChange={(e) => update(index, { help_text: e.target.value })} />
                </div>
                {field.type !== "consent" && !CHOICE_TYPES.includes(field.type) ? (
                  <div className="grid gap-1.5">
                    <label htmlFor={id("placeholder")} className="text-sm font-medium">Exemplo dentro do campo</label>
                    <input id={id("placeholder")} className={inputClass()} value={field.placeholder} maxLength={120} onChange={(e) => update(index, { placeholder: e.target.value })} />
                  </div>
                ) : null}
                {LIMIT_TYPES.includes(field.type) ? (
                  <div className="grid grid-cols-2 gap-3">
                    {(["min", "max"] as const).map((bound) => (
                      <div key={bound} className="grid gap-1.5">
                        <label htmlFor={id(bound)} className="text-sm font-medium">
                          {bound === "min" ? "Mínimo" : "Máximo"} {field.type === "number" ? "(valor)" : "(caracteres)"}
                        </label>
                        <input
                          id={id(bound)}
                          type="number"
                          className={inputClass()}
                          value={field.validation[bound] ?? ""}
                          onChange={(e) =>
                            update(index, { validation: { ...field.validation, [bound]: e.target.value === "" ? undefined : Number(e.target.value) } })
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {CHOICE_TYPES.includes(field.type) ? (
                <div className="grid gap-1.5">
                  <label htmlFor={id("options")} className="text-sm font-medium">Opções (uma por linha)</label>
                  <textarea
                    id={id("options")}
                    className={`${inputClass()} min-h-24 py-2`}
                    value={field.options.join("\n")}
                    onChange={(e) => update(index, { options: e.target.value.split("\n") })}
                    onBlur={() => update(index, { options: field.options.map((o) => o.trim()).filter(Boolean) })}
                  />
                </div>
              ) : null}

              {identity ? (
                <p className="text-sm text-ink-muted">Campo fixo: identifica o participante e é sempre obrigatório.</p>
              ) : locked ? (
                <p className="text-sm text-ink-muted">Obrigatória em todos os eventos (definido no banco de perguntas).</p>
              ) : (
                <div className="flex flex-wrap gap-5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={field.required} onChange={(e) => update(index, { required: e.target.checked })} />
                    Obrigatório
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={field.is_active} onChange={(e) => update(index, { is_active: e.target.checked })} />
                    Ativo
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {bank.some((q) => !q.always_on) ? (
        <fieldset className="grid gap-2 rounded-(--radius-card) border border-line p-4">
          <legend className="px-1 text-sm font-semibold">Perguntas do banco</legend>
          <ul className="grid divide-y divide-line">
            {bank
              .filter((q) => !q.always_on)
              .map((q) => {
                const on = fields.some((f) => f.key === bankFieldKey(q.id) && f.is_active);
                return (
                  <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                    <span className={`text-sm font-medium ${on ? "" : "text-ink-muted"}`}>
                      {q.label} <span className="font-normal text-ink-muted">· {FIELD_TYPE_LABELS[q.type]}</span>
                    </span>
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        className="size-4"
                        checked={on}
                        disabled={!on && fields.length >= 60}
                        onChange={(e) => toggleBank(q, e.target.checked)}
                        aria-label={`Usar "${q.label}" neste formulário`}
                      />
                      {on ? "Ativado" : "Desativado"}
                    </label>
                  </li>
                );
              })}
          </ul>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-(--radius-card) border border-dashed border-line-strong p-4">
        <div className="grid gap-1.5">
          <label htmlFor="new-field-type" className="text-sm font-medium">Novo campo</label>
          <select id="new-field-type" className={inputClass()} value={newType} onChange={(e) => setNewType(e.target.value as FieldType)}>
            {ADDABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={add} disabled={fields.length >= 60}>
          Adicionar campo
        </Button>
      </div>

      <SubmitButton pendingLabel="Salvando…">Salvar formulário</SubmitButton>
    </form>
  );
}
