import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md font-semibold text-ink">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        EH
      </span>
      <span className="text-lg tracking-tight">EventHubs</span>
    </Link>
  );
}
