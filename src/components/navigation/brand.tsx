import Link from "next/link";

// `tone="dark"` para fundos roxos escuros (sidebar, hero, autenticação).
export function Brand({ href = "/", tone = "light" }: { href?: string; tone?: "light" | "dark" }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 rounded-md font-semibold ${tone === "dark" ? "text-white" : "text-ink"}`}>
      <span
        aria-hidden="true"
        className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-brand-gradient text-sm font-extrabold text-white shadow-(--shadow-glow) ring-1 ring-white/20"
      >
        EH
        <span className="absolute -right-2 -top-2 size-5 rounded-full border border-white/30" />
      </span>
      <span className="text-lg font-bold tracking-tight">EventHubs</span>
    </Link>
  );
}
