import { useMemo, useRef } from "react";
import { haptic } from "@/lib/haptics";

export interface PortfolioPoint {
  t: string;
  v: number;
}

/**
 * Minimal, edge-to-edge time-series line — thin non-scaling stroke, a dotted
 * break-even baseline, and a glowing end dot. Emerald when up, pink when down
 * (PoolBet's palette). Touch/mouse scrubbing reports the point under the finger
 * and fires a tick haptic as it crosses samples.
 */
export function PortfolioChart({
  points,
  start,
  height = 200,
  scrubIndex,
  onScrub,
}: {
  points: PortfolioPoint[];
  start: number;
  height?: number;
  scrubIndex: number | null;
  onScrub: (i: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastIdx = useRef(-1);

  const geo = useMemo(() => {
    const n = points.length;
    const vs = points.map((p) => p.v);
    const lo = Math.min(start, ...vs);
    const hi = Math.max(start, ...vs);
    const span = hi - lo || 1;
    const pad = span * 0.14;
    const min = lo - pad;
    const max = hi + pad;
    const xf = (i: number) => (n <= 1 ? 0 : i / (n - 1)); // 0..1
    const yf = (v: number) => (max - v) / (max - min); // 0 top .. 1 bottom
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(xf(i) * 1000).toFixed(2)},${(yf(p.v) * 300).toFixed(2)}`).join(" ");
    const up = (points[n - 1]?.v ?? start) >= start;
    return { xf, yf, d, baselineF: yf(start), up };
  }, [points, start]);

  const color = geo.up ? "hsl(var(--yes))" : "hsl(var(--no))";

  const handleMove = (clientX: number) => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (points.length - 1));
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      haptic("select");
      onScrub(idx);
    }
  };

  const end = points.length ? points[points.length - 1] : null;
  const active = scrubIndex != null ? points[scrubIndex] : null;

  return (
    <div
      ref={ref}
      className="relative w-full touch-none select-none"
      style={{ height }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handleMove(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") handleMove(e.clientX); }}
      onPointerUp={() => { lastIdx.current = -1; onScrub(null); }}
      onPointerCancel={() => { lastIdx.current = -1; onScrub(null); }}
      onPointerLeave={() => { lastIdx.current = -1; onScrub(null); }}
    >
      {/* dotted break-even baseline */}
      <div
        className="pointer-events-none absolute inset-x-0 border-t border-dotted border-muted-foreground/40"
        style={{ top: `${(geo.baselineF * 100).toFixed(2)}%` }}
      />

      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path
          d={geo.d}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      </svg>

      {/* scrub hairline */}
      {active && (
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-foreground/25"
          style={{ left: `${(geo.xf(scrubIndex as number) * 100).toFixed(2)}%` }}
        />
      )}

      {/* dot: scrubbed point, else the live end point */}
      {(active || end) && (
        <div
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4"
          style={{
            left: `${(geo.xf(active ? (scrubIndex as number) : points.length - 1) * 100).toFixed(2)}%`,
            top: `${(geo.yf((active ?? end)!.v) * 100).toFixed(2)}%`,
            background: color,
            boxShadow: `0 0 10px ${color}`,
            // ring uses the color at low alpha via currentColor-ish glow
            ["--tw-ring-color" as string]: geo.up ? "hsl(var(--yes) / 0.25)" : "hsl(var(--no) / 0.25)",
          }}
        />
      )}
    </div>
  );
}
