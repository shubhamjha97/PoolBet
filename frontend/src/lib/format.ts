// Shared formatting + odds helpers used across market/stat views.
import type { Bet, Market } from "./types";

export const fmt = (v: string | number) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

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

export function timeAgo(ts: string) {
  const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
