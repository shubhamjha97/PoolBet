import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AdminEvent, Snapshot } from "@/lib/types";
import { count, fmt, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { MultiLineChart } from "@/components/Charts";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

type Metrics = {
  users: number;
  groups: number;
  markets: number;
  bets: number;
  app_opens: number;
  session_seconds: number;
  active_users_7d: number;
  total_volume: string;
  house_earnings: string;
  events_per_day: { day: string; count: number }[];
  bets_per_day: { day: string; count: number }[];
};
type Settings = { house_rake: number };

// Turn a duration in seconds into a compact human string (e.g. "3d 4h", "2h 5m").
function humanizeSecs(total: number) {
  const secs = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return `${secs}s`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums">{value}</div>
    </Card>
  );
}

function dayPoints(rows: { day: string; count: number }[]) {
  return rows.map((r) => ({ t: Date.parse(r.day), v: Number(r.count) || 0 }));
}

function line(e: AdminEvent) {
  const p = (e.payload || {}) as P;
  const who = s(e.actor_name) || "system";
  switch (e.type) {
    case "bet_placed": return `${who} bet ${fmt(s(p.amount) || 0)} on ${s(p.side)}`;
    case "market_created": return `${who} opened a market`;
    case "market_resolved":
    case "market_settled": return `Resolved ${s(p.outcome)}`;
    case "buy_in": return `${who} bought in ${fmt(s(p.amount) || 0)}`;
    case "user_signup": return `${who} signed up`;
    case "user_login": return `${who} logged in`;
    case "group_create": return `${who} created a group`;
    case "group_join": return `${s(p.name) || who} joined a group`;
    case "access_approved": return `${s(p.name) || who} was approved`;
    case "evidence_added": return `${who} added evidence`;
    case "rollback": return `State rolled back`;
    default: return `${who} · ${e.type}`;
  }
}

// Format a Date as a `datetime-local` input value in the viewer's local time.
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const RANGES = [
  { k: "15m", label: "15m", ms: 15 * 60_000 },
  { k: "1h", label: "1h", ms: 60 * 60_000 },
  { k: "3h", label: "3h", ms: 3 * 60 * 60_000 },
  { k: "1d", label: "1d", ms: 24 * 60 * 60_000 },
  { k: "7d", label: "7d", ms: 7 * 24 * 60 * 60_000 },
  { k: "all", label: "All", ms: 0 },
] as const;

export function AdminPage() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [confirm, setConfirm] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<AdminEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rake, setRake] = useState(0); // fraction, e.g. 0.01 = 1%
  const [savingRake, setSavingRake] = useState(false);

  // Commit-log pagination + datetime filtering. Defaults to the last 15 minutes.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [range, setRange] = useState<string>("15m");
  const [start, setStart] = useState(() => toLocalInput(new Date(Date.now() - 15 * 60_000)));
  const [end, setEnd] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const applyRange = (k: string) => {
    const r = RANGES.find((x) => x.k === k)!;
    setRange(k);
    setPage(0);
    setEnd("");
    setStart(r.ms ? toLocalInput(new Date(Date.now() - r.ms)) : "");
    haptic("select");
  };

  const load = useCallback(async () => {
    try { setSnaps(await api<Snapshot[]>("GET", "/admin/snapshots")); } catch { setSnaps([]); }
    try { setMetrics(await api<Metrics>("GET", "/admin/metrics")); } catch { setMetrics(null); }
    try { setRake((await api<Settings>("GET", "/admin/settings")).house_rake); } catch { /* keep default */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadEvents = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    try {
      const rows = await api<AdminEvent[]>("GET", `/admin/events?${params}`);
      setEvents(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch { setEvents([]); setHasMore(false); }
  }, [page, start, end]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  async function saveRake() {
    setSavingRake(true);
    try {
      const next = await api<Settings>("POST", "/admin/settings", { house_rake: rake });
      setRake(next.house_rake);
      toast.success("House rake saved");
      haptic("success");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingRake(false);
    }
  }

  async function rollback() {
    if (!confirm) return;
    setBusy(true);
    haptic("warn");
    try {
      await api("POST", "/admin/rollback", { snapshot_id: confirm.id });
      toast.success("Rolled back");
      setConfirm(null);
      setPage(0);
      await Promise.all([load(), loadEvents()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> back</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">The commit log — every action is appended here, and you can roll the whole app back to any snapshot.</p>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Metrics</div>
        {!metrics ? (
          <p className="text-sm text-muted-foreground">No metrics yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Users" value={count(metrics.users)} />
              <Kpi label="Active 7d" value={count(metrics.active_users_7d)} />
              <Kpi label="Bets" value={count(metrics.bets)} />
              <Kpi label="Total volume" value={fmt(metrics.total_volume)} />
              <Kpi label="App opens" value={count(metrics.app_opens)} />
              <Kpi label="Session time" value={humanizeSecs(metrics.session_seconds)} />
              <Kpi label="House earnings" value={fmt(metrics.house_earnings)} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Events / day</div>
                {metrics.events_per_day.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No data.</p>
                ) : (
                  <MultiLineChart series={[{ name: "Events", points: dayPoints(metrics.events_per_day), highlight: true }]} />
                )}
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bets / day</div>
                {metrics.bets_per_day.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No data.</p>
                ) : (
                  <MultiLineChart series={[{ name: "Bets", points: dayPoints(metrics.bets_per_day), highlight: true }]} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">House rake</div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Rake</span>
            <span className="font-mono text-xl tabular-nums">{(rake * 100).toFixed(1)}%</span>
          </div>
          <Slider
            className="mt-3"
            min={0}
            max={5}
            step={0.1}
            value={[rake * 100]}
            onValueChange={(v) => setRake((v[0] ?? 0) / 100)}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">The house takes this % of each settled pot.</p>
            <Button size="sm" className="tactile active:scale-95" disabled={savingRake} onClick={saveRake}>Save</Button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rollback points</div>
        {snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots yet.</p>
        ) : (
          <div className="space-y-2">
            {snaps.map((sn) => (
              <div key={sn.id} className="flex items-center justify-between rounded-xl border bg-card p-3">
                <div>
                  <div className="text-sm font-medium">{sn.label || "snapshot"}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(sn.created_at)}</div>
                </div>
                <Button variant="destructive" size="sm" className="tactile active:scale-95" onClick={() => { haptic("tap"); setConfirm(sn); }}>
                  <RotateCcw className="size-3.5" /> Roll back
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Commit log</div>

        {/* quick range chips */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => applyRange(r.k)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                range === r.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* exact datetime range (calendar picker) */}
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            From
            <Input type="datetime-local" value={start} className="h-8 w-[13.5rem]"
              onChange={(e) => { setStart(e.target.value); setRange("custom"); setPage(0); }} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            To
            <Input type="datetime-local" value={end} className="h-8 w-[13.5rem]"
              onChange={(e) => { setEnd(e.target.value); setRange("custom"); setPage(0); }} />
          </label>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events in this range.</p>
        ) : (
          <div className="space-y-0">
            {events.map((e, i) => (
              <button
                key={e.id}
                onClick={() => { haptic("select"); setSelected(e); }}
                className="relative flex w-full gap-3 pb-3 text-left"
              >
                {i < events.length - 1 && <span className="absolute left-[4px] top-3 h-full w-px bg-border" />}
                <span className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{line(e)}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(e.ts)} · tap for details</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* pagination */}
        {(page > 0 || hasMore) && (
          <div className="mt-2 flex items-center justify-between">
            <Button variant="outline" size="sm" className="tactile active:scale-95"
              disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Newer</Button>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">page {page + 1}</span>
            <Button variant="outline" size="sm" className="tactile active:scale-95"
              disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Older</Button>
          </div>
        )}
      </div>

      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Roll back the app?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This restores the entire app state to this snapshot. Everything after it is undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={rollback}>Roll back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono">{selected?.type}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <span className="text-muted-foreground">when</span><span className="font-mono">{new Date(selected.ts).toLocaleString()}</span>
                <span className="text-muted-foreground">actor</span><span>{selected.actor_name ?? "—"}</span>
                <span className="text-muted-foreground">event id</span><span className="truncate font-mono text-xs">{selected.id}</span>
                {selected.group_id && (<><span className="text-muted-foreground">group</span><span className="truncate font-mono text-xs">{selected.group_id}</span></>)}
                {selected.market_id && (<><span className="text-muted-foreground">market</span><span className="truncate font-mono text-xs">{selected.market_id}</span></>)}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payload</div>
                <pre className="max-h-72 overflow-auto rounded-lg border bg-secondary/50 p-3 font-mono text-xs">{JSON.stringify(selected.payload, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
