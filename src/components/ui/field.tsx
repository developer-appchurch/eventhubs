import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// Gera os ids de dica e de erro de um campo, para que o controle e as mensagens se
// referenciem corretamente via aria-describedby.
export function useFieldIds(hint?: string, error?: string) {
  const base = useId();
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return { hintId, errorId, describedBy };
}

export function FieldWrapper({
  label,
  name,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  hintId: string;
  error?: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function inputClass(hasError?: boolean): string {
  return `min-h-11 w-full rounded-(--radius-control) border bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70 ${
    hasError ? "border-danger-ink" : "border-line-strong hover:border-brand-500 focus:border-brand-600 disabled:bg-surface-muted disabled:text-ink-muted"
  }`;
}

type CommonProps = { name: string; label: string; error?: string; hint?: string };

export function TextInput({ name, label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & CommonProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldWrapper label={label} name={props.id ?? name} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <input
        id={props.id ?? name}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={ids.describedBy}
        className={inputClass(Boolean(error))}
        {...props}
      />
    </FieldWrapper>
  );
}

export function SelectInput({
  name,
  label,
  error,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & CommonProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldWrapper label={label} name={props.id ?? name} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <select
        id={props.id ?? name}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={ids.describedBy}
        className={inputClass(Boolean(error))}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}

export function TextArea({ name, label, error, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & CommonProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldWrapper label={label} name={props.id ?? name} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <textarea
        id={props.id ?? name}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={ids.describedBy}
        className={`${inputClass(Boolean(error))} min-h-24 py-2`}
        {...props}
      />
    </FieldWrapper>
  );
}
