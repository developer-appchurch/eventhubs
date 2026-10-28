import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({ title, children, action, icon = "inbox" }: { title: string; children: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-(--radius-card) border border-dashed border-line-strong bg-surface p-6 sm:p-8">
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
        <Icon name={icon} />
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="max-w-prose text-sm text-ink-muted">{children}</div>
      {action}
    </div>
  );
}
