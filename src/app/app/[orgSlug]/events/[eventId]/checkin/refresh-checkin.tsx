"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const AUTO_MS = 30_000;
const PULL_PX = 80;

// Mantém o check-in em dia com vários aparelhos: botão, puxar para baixo (o app instalado não
// tem o gesto nativo), volta para a aba e, a cada 30 s, só com a aba visível.
export function RefreshCheckin() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const refresh = () => startTransition(() => router.refresh());

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const id = setInterval(tick, AUTO_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  useEffect(() => {
    let startY: number | null = null;
    const start = (e: TouchEvent) => {
      startY = window.scrollY === 0 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (startY !== null) setPull(Math.max(0, Math.min(PULL_PX, e.touches[0].clientY - startY)));
    };
    const end = () => {
      if (startY !== null && pull >= PULL_PX) refresh();
      startY = null;
      setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh só usa router e startTransition, estáveis
  }, [pull]);

  return (
    <div className="flex justify-end" style={{ marginTop: pull / 4 }}>
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline disabled:opacity-60"
      >
        {busy ? "Atualizando…" : pull >= PULL_PX ? "Solte para atualizar" : "Atualizar"}
      </button>
    </div>
  );
}
