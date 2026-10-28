import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-(--shadow-glow) active:bg-brand-800 disabled:bg-brand-600/50 disabled:shadow-none",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-brand-500 hover:bg-brand-50 active:bg-brand-100",
  ghost: "text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  danger: "bg-danger-ink text-white hover:brightness-95 active:brightness-90",
};

// Classes de botão reutilizáveis por links (<a>/<Link>) que precisam da mesma aparência.
export function buttonClass(variant: Variant = "primary", className = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-(--radius-control) px-4 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress ${variants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
