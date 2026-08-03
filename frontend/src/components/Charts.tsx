// Neon SVG charts. These signatures are the CONTRACT other components import
// against. Elegant, minimal, responsive. Dark OLED default; readable in light
// mode via theme tokens. Unique gradient/filter ids per instance via useId().

import { useId } from "react";

/** Tiny trend line. ~120x34 viewBox, neon-green stroke, dot at last point. */
export function Sparkline({ values }: { values: number[] }) {
  const uid = useId();
  const W = 120;
  const H = 34;
  const PAD = 3;

  if (values.length < 2) {
    // Flat faint baseline when there isn't enough to draw a trend.
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <line
          x1={PAD}
          y1={H / 2}
          x2={W - PAD}
          y2={H / 2}
          className="stroke-muted-foreground"
          strokeWidth={2}
          strokeLinecap="round"
          strokeOpacity={0.35}
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const coords = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });

  const points = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      <defs>
        <filter id={`spark-glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="currentColor" floodOpacity="0.5" />
        </filter>
      </defs>
      <polyline
        points={points}
        fill="none"
        className="stroke-yes text-yes"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#spark-glow-${uid})`}
      />
      <circle cx={lx} cy={ly} r={2.4} className="fill-yes" />
    </svg>
  );
}

/** Implied P(YES) over time. Green line + soft area fill, 50% baseline, y labels. */
export function ProbabilityChart({ points }: { points: { t: number; yes: number }[] }) {
  const uid = useId();
  const W = 320;
  const H = 160;
  const PL = 34; // left gutter for y labels
  const PR = 10;
  const PT = 12;
  const PB = 12;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const yToPx = (yes: number) => PT + (1 - Math.min(1, Math.max(0, yes))) * plotH;
  const baseline = yToPx(0.5);

  const labels = [
    { yes: 1, text: "100%" },
    { yes: 0.5, text: "50%" },
    { yes: 0, text: "0%" },
  ];

  const empty = points.length === 0;
  // Empty or single point: draw a flat line at that value (or 0.5) across full width.
  const value = empty ? 0.5 : points[points.length - 1].yes;

  let coords: (readonly [number, number])[];
  if (points.length >= 2) {
    coords = points.map((p, i) => {
      const x = PL + (i / (points.length - 1)) * plotW;
      return [x, yToPx(p.yes)] as const;
    });
  } else {
    const y = yToPx(value);
    coords = [
      [PL, y] as const,
      [PL + plotW, y] as const,
    ];
  }

  const linePath = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${(PL + plotW).toFixed(2)} ${(PT + plotH).toFixed(2)} L${PL.toFixed(2)} ${(PT + plotH).toFixed(2)} Z`;
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      <defs>
        <linearGradient id={`prob-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" className="text-yes" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-yes" />
        </linearGradient>
        <filter id={`prob-glow-${uid}`} x="-10%" y="-30%" width="120%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="currentColor" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* y grid labels */}
      {labels.map((l) => {
        const y = yToPx(l.yes);
        return (
          <g key={l.text}>
            <text
              x={PL - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground tabular-nums"
              fontSize={9}
            >
              {l.text}
            </text>
          </g>
        );
      })}

      {/* dashed 50% baseline */}
      <line
        x1={PL}
        y1={baseline}
        x2={PL + plotW}
        y2={baseline}
        className="stroke-border"
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* area fill */}
      <path d={areaPath} fill={`url(#prob-fill-${uid})`} className="text-yes" />

      {/* line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-yes text-yes"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#prob-glow-${uid})`}
      />

      {/* glowing dot at last point */}
      <circle cx={lx} cy={ly} r={4.5} className="fill-yes" fillOpacity={0.18} />
      <circle cx={lx} cy={ly} r={3} className="fill-yes text-yes" filter={`url(#prob-glow-${uid})`} />
    </svg>
  );
}

/** Horizontal bars. Label left, rounded neon track, value right. Auto-scaled. */
export function BarsChart({
  items,
  format,
}: {
  items: { label: string; value: number; highlight?: boolean }[];
  format?: (v: number) => string;
}) {
  const fmt = format ?? String;
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const pct = Math.max(0, (it.value / max) * 100);
        return (
          <div key={it.label} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 truncate text-muted-foreground">{it.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={
                  it.highlight
                    ? "h-full rounded-full bg-no transition-[width] duration-500"
                    : "h-full rounded-full bg-yes transition-[width] duration-500"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums">{fmt(it.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Multiple lines, one auto-scaled y. Highlighted = neon green + end dot + label. */
export function MultiLineChart({
  series,
}: {
  series: { name: string; points: { t: number; v: number }[]; highlight?: boolean }[];
}) {
  const uid = useId();
  const W = 340;
  const H = 180;
  const PL = 6;
  const PR = 6;
  const PT = 12;
  const PB = 12;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const drawable = series.filter((s) => s.points.length >= 2);
  const all = drawable.flatMap((s) => s.points.map((p) => p.v));
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const span = max - min || 1;

  const project = (points: { t: number; v: number }[]) =>
    points
      .map((p, i) => {
        const x = PL + (i / (points.length - 1)) * plotW;
        const y = PT + (1 - (p.v - min) / span) * plotH;
        return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const endPoint = (points: { t: number; v: number }[]) => {
    const x = PL + plotW;
    const y = PT + (1 - (points[points.length - 1].v - min) / span) * plotH;
    return [x, y] as const;
  };

  // Draw muted lines first, highlighted on top.
  const ordered = [...drawable].sort((a, b) => Number(!!a.highlight) - Number(!!b.highlight));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      <defs>
        <filter id={`ml-glow-${uid}`} x="-10%" y="-30%" width="120%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="currentColor" floodOpacity="0.5" />
        </filter>
      </defs>

      {ordered.map((s) => {
        const d = project(s.points);
        if (s.highlight) {
          const [ex, ey] = endPoint(s.points);
          return (
            <g key={s.name} className="text-yes">
              <path
                d={d}
                fill="none"
                className="stroke-yes"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#ml-glow-${uid})`}
              />
              <circle cx={ex} cy={ey} r={3} className="fill-yes" filter={`url(#ml-glow-${uid})`} />
              <text
                x={ex - 4}
                y={ey - 7}
                textAnchor="end"
                className="fill-yes"
                fontSize={9}
              >
                {s.name}
              </text>
            </g>
          );
        }
        return (
          <path
            key={s.name}
            d={d}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
