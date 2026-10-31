import Link from "@/components/navigation/intent-link";
import type { ReadinessItem } from "@/lib/readiness";

// Lista do que falta antes de publicar; some quando tudo está feito.
export function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  if (items.every((item) => item.done)) return null;
  return (
    <div className="rounded-(--radius-control) border border-line bg-brand-50 p-3 text-sm">
      <p className="font-semibold text-brand-900">Antes de publicar</p>
      <ul className="mt-2 grid gap-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2">
            <span aria-hidden>{item.done ? "✓" : "○"}</span>
            {item.done ? (
              <span className="text-ink-muted line-through">{item.label}</span>
            ) : (
              <Link href={item.href} className="font-medium text-brand-700 hover:underline">
                {item.label}
                {item.required ? "" : " (recomendado)"}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
