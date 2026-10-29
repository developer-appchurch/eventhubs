"use client";

import { useEffect, useState } from "react";

// Contagem até o início do evento. Só aparece depois de montar no navegador: o horário do
// servidor e o do cliente diferem, e renderizar no servidor causaria divergência na hidratação.
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const left = now === null ? 0 : Math.floor((new Date(to).getTime() - now) / 1000);
  if (left <= 0) return null;
  const parts: [number, string][] = [
    [Math.floor(left / 86400), "Dias"],
    [Math.floor(left / 3600) % 24, "Horas"],
    [Math.floor(left / 60) % 60, "Min"],
    [left % 60, "Seg"],
  ];

  return (
    <div className="flex justify-center gap-4 bg-ink/55 px-4 py-4 text-white @sm:gap-6 @xl:gap-10" role="timer" aria-label="Tempo até o início do evento">
      {parts.map(([value, label]) => (
        <div key={label} className="grid justify-items-center">
          <span className="text-3xl font-extrabold tabular-nums @xl:text-4xl">{value}</span>
          <span className="text-xs text-white/85">{label}</span>
        </div>
      ))}
    </div>
  );
}
