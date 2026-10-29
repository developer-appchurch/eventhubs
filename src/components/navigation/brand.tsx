import Image from "next/image";
import Link from "next/link";

// `tone="dark"` para fundos roxos escuros (sidebar, hero, autenticação).
export function Brand({ href = "/", tone = "light" }: { href?: string; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <Link href={href} className="relative inline-flex items-center rounded-md">
      {/* Brilho suave só atrás do ícone "V": mesmo tamanho dele (h-8 da logo). */}
      <span aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 size-8 -translate-y-1/2 rounded-xl bg-brand-500/50 blur-md" />
      <Image
        src={dark ? "/brand/eventhub.png" : "/brand/eventhub-escuro.png"}
        alt="EventHub"
        width={dark ? 360 : 358}
        height={dark ? 76 : 77}
        priority
        className="relative h-8 w-auto"
      />
    </Link>
  );
}
