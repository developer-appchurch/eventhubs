"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recarrega os dados da página enquanto o pagamento está pendente, para a confirmação do
// Mercado Pago aparecer sem a pessoa recarregar. Para quando a reserva vence.
export function RefreshWhilePending({ until }: { until: string }) {
  const router = useRouter();
  useEffect(() => {
    const end = new Date(until).getTime();
    const id = setInterval(() => {
      if (Date.now() > end) clearInterval(id);
      if (!document.hidden) router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router, until]);
  return null;
}
