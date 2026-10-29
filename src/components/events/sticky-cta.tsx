"use client";

import { useEffect, useState } from "react";

// Botão fixo no rodapé do celular que leva ao formulário; some quando o formulário já está na tela.
export function StickyCta({ label }: { label: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const target = document.getElementById("inscricao");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 shadow-(--shadow-overlay) backdrop-blur md:hidden">
      <a href="#inscricao" className="flex min-h-11 w-full items-center justify-center rounded-full bg-brand-700 px-6 text-sm font-bold text-white hover:bg-brand-900">
        {label}
      </a>
    </div>
  );
}
