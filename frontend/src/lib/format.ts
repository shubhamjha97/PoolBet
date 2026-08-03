// Shared formatting + odds helpers used across market/stat views.
import type { Bet, Market } from "./types";

// Money — credits are fractional; always show exactly 2 decimals.
export const fmt = (v: string | number) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Whole-number counts (users, bets, …) — thousands separator, no decimals.
export const count = (v: string | number) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

export function closesInfo(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const closed = ms <= 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3.6e6);
  const m = Math.floor((abs % 3.6e6) / 6e4);
  const span = h >= 24 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return { closed, text: closed ? `closed ${span} ago` : `closes in ${span}` };
}

export function poolPct(m: Market) {
  const total = Number(m.yes_pool) + Number(m.no_pool);
  const yes = total > 0 ? Math.round((Number(m.yes_pool) / total) * 100) : 50;
  return { total, yes, no: 100 - yes };
}

// Reconstruct implied P(YES) over time from ordered bets.
export function oddsSeries(bets: Bet[]) {
  const sorted = [...bets].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let y = 0;
  let n = 0;
  return sorted.map((b) => {
    if (b.side === "YES") y += Number(b.amount);
    else n += Number(b.amount);
    const t = y + n;
    return { t: Date.parse(b.created_at), yes: t ? y / t : 0.5 };
  });
}

// Each outcome's implied probability (share of the pot, %) over time — one line
// per outcome for N-way markets.
export function oddsSeriesMulti(bets: Bet[], outcomes: string[]) {
  const sorted = [...bets].filter((b) => b.outcome).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const pools: Record<string, number> = {};
  const points: Record<string, { t: number; v: number }[]> = {};
  for (const o of outcomes) { pools[o] = 0; points[o] = []; }
  let total = 0;
  sorted.forEach((b, i) => {
    if (!b.outcome || !(b.outcome in pools)) return;
    pools[b.outcome] += Number(b.amount);
    total += Number(b.amount);
    // +i keeps each bet a distinct x even when timestamps share the same second.
    const t = Date.parse(b.created_at) + i;
    for (const o of outcomes) points[o].push({ t, v: total ? Math.round((pools[o] / total) * 100) : 0 });
  });
  return outcomes.map((o) => ({ name: o, points: points[o] }));
}

export function timeAgo(ts: string) {
  const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
