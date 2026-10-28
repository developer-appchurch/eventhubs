"use client";

import { Fragment, useActionState, useState, type ReactNode } from "react";
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
  const [editing, setEditing] = useState<string | null>(null);

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
      const key = fieldKeyFromLabel(label, list.map((f) => f.key));
      setEditing(key);
      return [
        ...list,
        {
          key,
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

      <div className="overflow-x-auto rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-brand-100 text-xs uppercase tracking-wide text-brand-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Campo</th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                <span className="sm:hidden">Obrig.</span>
                <span className="hidden sm:inline">Obrigatório</span>
              </th>
              <th scope="col" className="px-2 py-3 text-center font-semibold">
                <span className="sm:hidden">Ativo</span>
                <span className="hidden sm:inline">Ativado / desativado</span>
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Opções</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map((field, index) => {
              const identity = IDENTITY_TYPES.includes(field.type);
              const locked = identity || lockedKeys.includes(field.key);
              const open = editing === field.key;
              const id = (part: string) => `field-${field.key}-${part}`;
              return (
                <Fragment key={field.key}>
                  <tr className={`${field.is_active ? "" : "text-ink-muted"} hover:bg-brand-50`}>
                    <th scope="row" className="break-words px-3 py-3 sm:px-4 text-left align-top">
                      <span className="block text-base font-semibold">{field.label || "(sem rótulo)"}</span>
                      <span className="text-xs font-normal text-ink-muted">
                        {FIELD_TYPE_LABELS[field.type]}
                        {field.key.startsWith("q_") ? " · banco de perguntas" : ""}
                      </span>
                    </th>
                    <td className="px-2 py-3 text-center align-top">
                      <input
                        type="checkbox"
                        className="size-5 accent-brand-600"
                        checked={field.required}
                        disabled={locked}
                        onChange={(e) => update(index, { required: e.target.checked })}
                        aria-label={`${field.label} é obrigatório`}
                      />
                    </td>
                    <td className="px-2 py-3 text-center align-top">
                      {locked ? (
                        <span className="text-xs text-ink-muted">Sempre</span>
                      ) : (
                        <Switch checked={field.is_active} onChange={(on) => update(index, { is_active: on })} label={`Usar ${field.label} neste formulário`} />
                      )}
                    </td>
                    <td className="px-2 py-3 align-top sm:px-4">
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                        <IconButton onClick={() => move(index, -1)} disabled={index === 0} label={`Mover ${field.label} para cima`}>↑</IconButton>
                        <IconButton onClick={() => move(index, 1)} disabled={index === fields.length - 1} label={`Mover ${field.label} para baixo`}>↓</IconButton>
                        <IconButton onClick={() => setEditing(open ? null : field.key)} label={`${open ? "Fechar edição de" : "Editar"} ${field.label}`} pressed={open}>✎</IconButton>
                        {locked ? null : (
                          <IconButton onClick={() => setFields((list) => list.filter((_, i) => i !== index))} label={`Excluir ${field.label}`} danger>
                            🗑
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-surface-muted/50 hover:bg-brand-50">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="grid gap-4">
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

                        {locked || field.key.startsWith("q_") ? null : (
                          <div>
                            <Button variant="secondary" onClick={() => saveToBank(index)}>
                              Salvar no banco de perguntas
                            </Button>
                          </div>
                        )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {bank
              .filter((q) => !fields.some((f) => f.key === bankFieldKey(q.id)))
              .map((q) => (
                <tr key={q.id} className="text-ink-muted hover:bg-brand-50">
                  <th scope="row" className="break-words px-3 py-3 sm:px-4 text-left font-semibold">
                    {q.label}
                    <span className="block text-xs font-normal">{FIELD_TYPE_LABELS[q.type]} · banco de perguntas</span>
                  </th>
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="size-5" checked={q.required} disabled aria-label={`${q.label} é obrigatório`} />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <Switch checked={false} disabled={fields.length >= 60} onChange={() => toggleBank(q, true)} label={`Usar ${q.label} neste formulário`} />
                  </td>
                  <td />
                </tr>
              ))}
          </tbody>
        </table>
      </div>

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

// Interruptor liga/desliga com o texto do estado ao lado.
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 rounded-full text-xs text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
      <span className="hidden sm:inline">{checked ? "Ativado" : "Desativado"}</span>
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-40 ${
        danger ? "text-danger-ink" : "text-brand-700"
      } ${pressed ? "bg-brand-50" : ""}`}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
