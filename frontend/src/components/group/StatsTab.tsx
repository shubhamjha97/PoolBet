import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Group, Market, PnlSeries } from "@/lib/types";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { BarsChart, MultiLineChart, ProbabilityChart } from "@/components/Charts";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="rounded-xl border bg-card p-4">{children}</div>
    </div>
  );
}

export function StatsTab({ group, markets }: { group: Group; markets: Market[] }) {
  const { user } = useAuth();
  const [pnl, setPnl] = useState<PnlSeries[]>([]);

  useEffect(() => { api<PnlSeries[]>("GET", `/groups/${group.id}/pnl`).then(setPnl).catch(() => setPnl([])); }, [group.id]);

  const board = [...group.members]
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .map((m) => ({ label: m.name + (m.user_id === user?.id ? " (you)" : ""), value: Number(m.balance), highlight: m.user_id === user?.id }));

  const pseries = pnl.map((s) => ({ name: s.name, highlight: s.user_id === user?.id, points: s.series.map((p) => ({ t: Date.parse(p.t), v: p.balance })) }));

  const allBets = markets.flatMap((m) => m.bets.map((b) => ({ t: Date.parse(b.created_at), amount: Number(b.amount) }))).sort((a, b) => a.t - b.t);
  let cum = 0;
  const vol = allBets.map((b) => ({ t: b.t, v: (cum += b.amount) }));

  const probMarkets = markets.filter((m) => m.bets.length).map((m) => {
    const sorted = [...m.bets].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let y = 0, n = 0;
    const pts = sorted.map((b) => { if (b.side === "YES") y += Number(b.amount); else n += Number(b.amount); const t = y + n; return { t: Date.parse(b.created_at), yes: t ? y / t : 0.5 }; });
    return { q: m.question, pts };
  });

  const empty = <p className="py-4 text-center text-sm text-muted-foreground">Not enough data yet.</p>;

  return (
    <div className="space-y-5">
      <Section title="Standings"><BarsChart items={board} format={fmt} /></Section>
      <Section title="Net worth over time">{pseries.some((s) => s.points.length > 1) ? <MultiLineChart series={pseries} /> : empty}</Section>
      <Section title="Volume wagered (cumulative)">{vol.length > 1 ? <MultiLineChart series={[{ name: "volume", highlight: true, points: vol }]} /> : empty}</Section>
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Probability history</div>
        {probMarkets.length ? (
          <div className="space-y-3">
            {probMarkets.map((pc, i) => (
              <div key={i} className="rounded-xl border bg-card p-4">
                <div className="mb-1 text-sm font-medium">{pc.q}</div>
                <ProbabilityChart points={pc.pts} />
              </div>
            ))}
          </div>
        ) : empty}
      </div>
    </div>
  );
}
