import Image from "next/image";
import Link from "next/link";

// `tone="dark"` para fundos roxos escuros (sidebar, hero, autenticação).
export function Brand({ href = "/", tone = "light" }: { href?: string; tone?: "light" | "dark" }) {
  return (
    <Link href={href} className="inline-flex items-center rounded-md">
      <Image
        src={tone === "dark" ? "/brand/eventhub.png" : "/brand/eventhub-escuro.png"}
        alt="EventHub"
        width={357}
        height={76}
        priority
        className="h-8 w-auto"
      />
    </Link>
  );
}
