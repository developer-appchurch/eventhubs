"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { INITIAL_STATE } from "@/lib/errors";
import { deleteBankQuestion, saveBankQuestion } from "@/modules/question-bank/actions";
import { CHOICE_TYPES, FIELD_TYPE_LABELS, FIELD_TYPES, IDENTITY_TYPES, type BankQuestion, type FieldType } from "@/modules/forms/fields";

const BANK_TYPES = FIELD_TYPES.filter((t) => !IDENTITY_TYPES.includes(t));
const LIMIT_TYPES: readonly FieldType[] = ["short_text", "long_text", "number"];

// Cria ou edita uma pergunta do banco. "Sempre" a coloca, obrigatória, em todo formulário.
export function QuestionForm({ organizationSlug, question }: { organizationSlug: string; question?: BankQuestion }) {
  const [state, action] = useActionState(saveBankQuestion, INITIAL_STATE);
  const [deleteState, deleteAction] = useActionState(deleteBankQuestion, INITIAL_STATE);
  const [type, setType] = useState<FieldType>(question?.type ?? "short_text");
  const [alwaysOn, setAlwaysOn] = useState(question?.always_on ?? false);
  const id = (part: string) => `q-${question?.id ?? "new"}-${part}`;
  const message = deleteState.message ? deleteState : state;

  return (
    <div className="grid gap-4">
      {message.message ? <Alert tone={message.ok ? "success" : "danger"}>{message.message}</Alert> : null}
      <form action={action} className="grid gap-4">
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="questionId" value={question?.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <label htmlFor={id("label")} className="text-sm font-medium">Pergunta</label>
            <input id={id("label")} name="label" required maxLength={120} className={inputClass()} defaultValue={question?.label} placeholder="Ex.: CPF, Nome da sua célula?" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("type")} className="text-sm font-medium">Tipo de resposta</label>
            <select id={id("type")} name="type" className={inputClass()} value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {BANK_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={id("help")} className="text-sm font-medium">Texto de ajuda</label>
            <input id={id("help")} name="help_text" maxLength={300} className={inputClass()} defaultValue={question?.help_text} />
          </div>
          {type !== "consent" && !CHOICE_TYPES.includes(type) ? (
            <div className="grid gap-1.5">
              <label htmlFor={id("placeholder")} className="text-sm font-medium">Exemplo dentro do campo</label>
              <input id={id("placeholder")} name="placeholder" maxLength={120} className={inputClass()} defaultValue={question?.placeholder} />
            </div>
          ) : null}
          {LIMIT_TYPES.includes(type) ? (
            <div className="grid grid-cols-2 gap-3">
              {(["min", "max"] as const).map((bound) => (
                <div key={bound} className="grid gap-1.5">
                  <label htmlFor={id(bound)} className="text-sm font-medium">{bound === "min" ? "Mínimo" : "Máximo"}</label>
                  <input id={id(bound)} name={bound} type="number" className={inputClass()} defaultValue={question?.validation[bound]} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {CHOICE_TYPES.includes(type) ? (
          <div className="grid gap-1.5">
            <label htmlFor={id("options")} className="text-sm font-medium">Opções (uma por linha)</label>
            <textarea id={id("options")} name="options" className={`${inputClass()} min-h-24 py-2`} defaultValue={question?.options.join("\n")} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="always_on" className="size-4" checked={alwaysOn} onChange={(e) => setAlwaysOn(e.target.checked)} />
            Obrigatória em todos os eventos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="required" className="size-4" defaultChecked={question?.required} disabled={alwaysOn} />
            Obrigatória quando usada
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingLabel="Salvando…">{question ? "Salvar pergunta" : "Adicionar ao banco"}</SubmitButton>
        </div>
      </form>
      {question ? (
        <form action={deleteAction}>
          <input type="hidden" name="organizationSlug" value={organizationSlug} />
          <input type="hidden" name="questionId" value={question.id} />
          <Button type="submit" variant="ghost" className="text-danger-ink">Excluir do banco</Button>
        </form>
      ) : null}
    </div>
  );
}
