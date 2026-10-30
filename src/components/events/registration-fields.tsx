import { inputClass } from "@/components/ui/field";
import { maskCpf } from "@/lib/cpf";
import { maskPhone } from "@/lib/phone";
import type { FormField } from "@/modules/forms/fields";

const INPUT_TYPES: Partial<Record<FormField["type"], string>> = {
  name: "text",
  email: "email",
  phone: "tel",
  cpf: "text",
  short_text: "text",
  number: "text",
  date: "date",
};

// Renderiza os campos do formulário de inscrição a partir da definição salva. Os nomes
// seguem "answer.<key>", o formato lido por answersFromFormData no servidor.
export function RegistrationFields({
  fields,
  errors = {},
  prefix = "",
}: {
  fields: Omit<FormField, "is_active">[];
  errors?: Record<string, string>;
  prefix?: string;
}) {
  const idPrefix = prefix.replace(/\W/g, "-");
  return (
    <div className="grid gap-5">
      {fields.map((field) => {
        const id = `${idPrefix}answer-${field.key}`;
        const name = `${prefix}answer.${field.key}`;
        const error = errors[field.key];
        const describedBy = [field.help_text ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
        const label = (
          <>
            {field.label}
            {field.required ? <span className="text-danger-ink"> *</span> : <span className="font-normal text-ink-muted"> (opcional)</span>}
          </>
        );
        const meta = (
          <>
            {field.help_text ? (
              <p id={`${id}-hint`} className="text-sm text-ink-muted">
                {field.help_text}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} className="text-sm font-medium text-danger-ink">
                {error}
              </p>
            ) : null}
          </>
        );

        if (field.type === "consent") {
          return (
            <div key={field.key} className="grid gap-1.5">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name={name} className="mt-1 size-4" aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} />
                <span>{label}</span>
              </label>
              {meta}
            </div>
          );
        }

        if (field.type === "single_choice" || field.type === "multiple_choice") {
          return (
            <fieldset key={field.key} className="grid gap-2" aria-describedby={describedBy}>
              <legend className="mb-1 text-sm font-medium">{label}</legend>
              {field.options.map((option) => (
                <label key={option} className="flex items-center gap-3 text-sm">
                  <input type={field.type === "single_choice" ? "radio" : "checkbox"} name={name} value={option} className="size-4" />
                  {option}
                </label>
              ))}
              {meta}
            </fieldset>
          );
        }

        return (
          <div key={field.key} className="grid gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              {label}
            </label>
            {field.type === "long_text" ? (
              <textarea id={id} name={name} placeholder={field.placeholder} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} className={`${inputClass(Boolean(error))} min-h-24 py-2`} />
            ) : field.type === "dropdown" ? (
              <select id={id} name={name} defaultValue="" aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} className={inputClass(Boolean(error))}>
                <option value="">Selecione…</option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={name}
                type={INPUT_TYPES[field.type] ?? "text"}
                inputMode={field.type === "number" ? "decimal" : field.type === "cpf" ? "numeric" : undefined}
                autoComplete={field.type === "name" ? "name" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : undefined}
                placeholder={field.placeholder}
                onInput={
                  field.type === "phone"
                    ? (e) => (e.currentTarget.value = maskPhone(e.currentTarget.value))
                    : field.type === "cpf"
                      ? (e) => (e.currentTarget.value = maskCpf(e.currentTarget.value))
                      : undefined
                }
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={describedBy}
                className={inputClass(Boolean(error))}
              />
            )}
            {meta}
          </div>
        );
      })}
    </div>
  );
}
