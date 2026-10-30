"use client";

import { useState } from "react";

const W = 600;
const H = 200;

// Inscrições confirmadas por dia: linha suave com área, e o dia sob o dedo/mouse em destaque.
export function RegistrationsChart({ daily }: { daily: { day: string; n: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = daily.reduce((sum, d) => sum + d.n, 0);
  const top = niceMax(Math.max(...daily.map((d) => d.n)));
  const points = daily.map((d, i) => ({ x: (i / Math.max(1, daily.length - 1)) * W, y: H - (d.n / top) * H }));
  const line = smoothPath(points);
  const point = active === null ? null : points[active];

  function pick(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(ratio * (daily.length - 1)));
  }

  return (
    <div>
      <p className="sr-only">
        {total} inscrições confirmadas nos últimos {daily.length} dias.
      </p>
      <div aria-hidden="true" className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="flex h-44 flex-col justify-between text-right text-xs tabular-nums text-ink-muted">
          {[top, top / 2, 0].map((v) => <span key={v} className="-my-2">{v}</span>)}
        </div>
        <div
          className="relative h-44 touch-pan-y"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
        >
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((i) => <span key={i} className="border-t border-dashed border-line" />)}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--color-brand-100)" fillOpacity={0.7} />
            <path d={line} fill="none" stroke="var(--color-brand-600)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          </svg>
          {point && active !== null ? (
            <>
              <span className="absolute bottom-0 w-px bg-line-strong" style={{ left: `${(point.x / W) * 100}%`, top: `${(point.y / H) * 100}%` }} />
              <span
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand-600 shadow"
                style={{ left: `${(point.x / W) * 100}%`, top: `${(point.y / H) * 100}%` }}
              />
              <span
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-1.5 text-center shadow-(--shadow-card)"
                style={{
                  left: `${(point.x / W) * 100}%`,
                  top: `${(point.y / H) * 100}%`,
                  translate: `${active < daily.length / 6 ? "0" : active > (daily.length * 5) / 6 ? "-100%" : "-50%"} calc(-100% - 0.75rem)`,
                }}
              >
                <span className="block text-base font-bold tabular-nums text-ink">{daily[active].n}</span>
                <span className="block text-xs text-ink-muted">{longDay(daily[active].day)}</span>
              </span>
            </>
          ) : null}
        </div>
        <div />
        <div className="mt-2 flex justify-between text-xs tabular-nums text-ink-muted">
          {daily.filter((_, i) => i % 7 === (daily.length - 1) % 7).map((d) => <span key={d.day}>{shortDay(d.day)}</span>)}
        </div>
      </div>
    </div>
  );
}

// Curva monotônica (Fritsch–Butland): suave, sem ondular entre pontos e nunca abaixo de zero.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return points.map((p) => `M${p.x},${p.y}`).join("");
  const dx = points[1].x - points[0].x;
  const d = points.slice(1).map((p, i) => (p.y - points[i].y) / dx);
  const t = points.map((_, i) => {
    if (i === 0) return d[0];
    if (i === points.length - 1) return d[i - 1];
    return d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
  });
  return points
    .map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const a = points[i - 1];
      return `C${a.x + dx / 3},${a.y + (t[i - 1] * dx) / 3} ${p.x - dx / 3},${p.y - (t[i] * dx) / 3} ${p.x},${p.y}`;
    })
    .join(" ");
}

// Teto do eixo arredondado e par, para a linha do meio também ser um número inteiro.
export function niceMax(max: number): number {
  if (max <= 2) return 2;
  const step = 10 ** Math.floor(Math.log10(max));
  return [2, 4, 6, 8, 10].map((m) => m * step).find((v) => v >= max) ?? 10 * step;
}

const shortDay = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
