// Charts built on Tremor. Export signatures are the contract other components
// import against; internals use @tremor/react.
import { AreaChart, BarList, LineChart, SparkLineChart } from "@tremor/react";

type Row = Record<string, string | number | undefined>;

const fmtTime = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });

/** Tiny trend line. */
export function Sparkline({ values }: { values: number[] }) {
  const data = (values.length ? values : [0, 0]).map((v, i) => ({ i, v }));
  return <SparkLineChart data={data} categories={["v"]} index="i" colors={["emerald"]} className="h-9 w-full" />;
}

/** Implied P(YES) over time as a filled area (0–100%). */
export function ProbabilityChart({ points }: { points: { t: number; yes: number }[] }) {
  const src = points.length ? points : [{ t: Date.now(), yes: 0.5 }];
  const data: Row[] = src.map((p) => ({ time: fmtTime(p.t), "P(YES)": Math.round(p.yes * 100) }));
  return (
    <AreaChart
      data={data}
      index="time"
      categories={["P(YES)"]}
      colors={["emerald"]}
      valueFormatter={(v) => `${v}%`}
      minValue={0}
      maxValue={100}
      showLegend={false}
      showGridLines={false}
      startEndOnly
      curveType="monotone"
      className="h-40"
    />
  );
}

/** Horizontal bars (leaderboard / standings). */
export function BarsChart({
  items,
  format,
}: {
  items: { label: string; value: number; highlight?: boolean }[];
  format?: (v: number) => string;
}) {
  const data = items.map((i) => ({ name: i.label, value: i.value }));
  return <BarList data={data} valueFormatter={format ?? ((v: number) => String(v))} color="emerald" className="mt-1" />;
}

/** Multiple series over time; highlighted series is emerald, others muted. */
export function MultiLineChart({
  series,
}: {
  series: { name: string; points: { t: number; v: number }[]; highlight?: boolean }[];
}) {
  const names = series.map((s) => s.name);
  const allT = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.t)))).sort((a, b) => a - b);
  const last: Record<string, number | undefined> = {};
  const data: Row[] = allT.map((t) => {
    const row: Row = { time: fmtTime(t) };
    for (const s of series) {
      const pt = s.points.find((p) => p.t === t);
      if (pt) last[s.name] = pt.v;
      row[s.name] = last[s.name];
    }
    return row;
  });
  const colors = series.map((s) => (s.highlight ? "emerald" : "zinc"));
  return (
    <LineChart
      data={data}
      index="time"
      categories={names}
      colors={colors}
      showLegend={names.length > 1}
      showGridLines={false}
      startEndOnly
      curveType="monotone"
      className="h-44"
    />
  );
}
