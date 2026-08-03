import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AdminEvent, Snapshot } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

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

  const load = useCallback(async () => {
    try { setSnaps(await api<Snapshot[]>("GET", "/admin/snapshots")); } catch { setSnaps([]); }
    try { setEvents(await api<AdminEvent[]>("GET", "/admin/events?limit=100")); } catch { setEvents([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
