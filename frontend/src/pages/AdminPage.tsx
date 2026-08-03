import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AdminEvent, Snapshot } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function AdminPage() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [confirm, setConfirm] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rake, setRake] = useState(0); // fraction, e.g. 0.01 = 1%
  const [savingRake, setSavingRake] = useState(false);

  const load = useCallback(async () => {
    try { setSnaps(await api<Snapshot[]>("GET", "/admin/snapshots")); } catch { setSnaps([]); }
    try { setEvents(await api<AdminEvent[]>("GET", "/admin/events?limit=100")); } catch { setEvents([]); }
    try { setMetrics(await api<Metrics>("GET", "/admin/metrics")); } catch { setMetrics(null); }
    try { setRake((await api<Settings>("GET", "/admin/settings")).house_rake); } catch { /* keep default */ }
  }, []);
  useEffect(() => { load(); }, [load]);

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
      await load();
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
              <Kpi label="Users" value={fmt(metrics.users)} />
              <Kpi label="Active 7d" value={fmt(metrics.active_users_7d)} />
              <Kpi label="Bets" value={fmt(metrics.bets)} />
              <Kpi label="Total volume" value={fmt(metrics.total_volume)} />
              <Kpi label="App opens" value={fmt(metrics.app_opens)} />
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
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty.</p>
        ) : (
          <div className="space-y-0">
            {events.map((e, i) => (
              <div key={e.id} className="relative flex gap-3 pb-3">
                {i < events.length - 1 && <span className="absolute left-[4px] top-3 h-full w-px bg-border" />}
                <span className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{line(e)}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(e.ts)}</div>
                </div>
              </div>
            ))}
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
    </div>
  );
}
