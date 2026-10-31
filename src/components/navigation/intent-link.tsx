"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// Link que só faz prefetch quando a pessoa demonstra intenção (mouse em cima ou toque), não ao
// aparecer na tela. Todas as rotas são dinâmicas: cada prefetch é uma execução de função na
// Vercel (CPU cobrada), e listas, menu lateral e o router.refresh() do check-in disparavam dezenas.
export default function IntentLink({ onMouseEnter, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
    />
  );
}
