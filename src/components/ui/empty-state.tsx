import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-(--radius-card) border border-dashed border-line-strong bg-surface p-6">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="text-sm text-ink-muted">{children}</div>
      {action}
    </div>
  );
}
