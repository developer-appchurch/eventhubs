import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card) sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink before:h-5 before:w-1 before:shrink-0 before:rounded-full before:bg-brand-600">
      {children}
    </h2>
  );
}

// Cabeçalho de página: título, descrição e ações alinhados.
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

// Grupo lógico de campos de um formulário: título e descrição à esquerda, campos à direita (empilhados no celular).
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-5 border-t border-line pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[13rem_1fr] lg:gap-8">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true" className="grid content-start gap-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid content-start gap-5">{children}</div>
    </fieldset>
  );
}
