"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Cada refresh renderiza a página no servidor (CPU cobrada na Vercel): a cada 15 s com a aba
// visível, e na hora em que a pessoa volta para a aba (ex.: depois de pagar no app do banco).
const INTERVAL_MS = 15_000;

// Recarrega os dados da página enquanto o pagamento está pendente, para a confirmação do
// Mercado Pago aparecer sem a pessoa recarregar. Para quando a reserva vence.
export function RefreshWhilePending({ until }: { until: string }) {
  const router = useRouter();
  useEffect(() => {
    const end = new Date(until).getTime();
    const tick = () => {
      if (Date.now() > end) return stop();
      if (!document.hidden) router.refresh();
    };
    const id = setInterval(tick, INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    function stop() {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    }
    return stop;
  }, [router, until]);
  return null;
}
