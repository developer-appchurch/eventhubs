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
    <h2 id={id} className="text-lg font-semibold text-ink">
      {children}
    </h2>
  );
}
