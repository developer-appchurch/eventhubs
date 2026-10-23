import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" }) {
  const styles = {
    neutral: "bg-surface-muted text-ink-muted",
    brand: "bg-brand-100 text-brand-900",
    success: "bg-success-bg text-success-ink",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>{children}</span>;
}
