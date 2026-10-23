import type { ReactNode } from "react";

type Tone = "success" | "danger" | "info" | "warning";

const tones: Record<Tone, string> = {
  success: "bg-success-bg text-success-ink border-success-ink/20",
  danger: "bg-danger-bg text-danger-ink border-danger-ink/20",
  info: "bg-info-bg text-info-ink border-info-ink/20",
  warning: "bg-warning-bg text-warning-ink border-warning-ink/20",
};

// role=status para confirmações e role=alert para erros, anunciados por leitores de tela.
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-(--radius-control) border px-4 py-3 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
