import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { Group } from "@/lib/types";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { PortfolioChart, type PortfolioPoint } from "@/components/PortfolioChart";
import { avatarGradient } from "@/lib/avatar";

interface Portfolio { points: PortfolioPoint[]; balance: number; start: number; pnl: number; }

const RANGES = [
  { k: "1d", label: "1D", ms: 864e5 },
  { k: "1w", label: "1W", ms: 6048e5 },
  { k: "1m", label: "1M", ms: 2592e6 },
  { k: "all", label: "All", ms: Infinity },
] as const;
import { useAuth } from "@/lib/auth";
import { enablePush } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GROUPS_KEY = "pb_groups";

function loadGroupIds(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberGroup(id: string): void {
  try {
    const ids = loadGroupIds();
    if (ids.includes(id)) return;
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...ids, id]));
  } catch {
    /* ignore */
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("all");
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  useEffect(() => {
    api<Portfolio>("GET", "/users/me/portfolio").then(setPortfolio).catch(() => setPortfolio(null));
  }, []);

  const rangePoints = useMemo(() => {
    if (!portfolio) return [];
    const span = RANGES.find((r) => r.k === range)!.ms;
    if (!isFinite(span)) return portfolio.points;
    const cut = Date.now() - span;
    const f = portfolio.points.filter((p) => new Date(p.t).getTime() >= cut);
    return f.length >= 2 ? f : portfolio.points;
  }, [portfolio, range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gs = await api<Group[]>("GET", "/groups/mine");
        if (!cancelled) setGroups(gs);
      } catch {
        // fallback to any locally-remembered groups
        const results = await Promise.all(
          loadGroupIds().map((id) => api<Group>("GET", `/groups/${id}`).catch(() => null)),
        );
        if (!cancelled) setGroups(results.filter((g): g is Group => g !== null));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onBell() {
    haptic("tap");
    try {
      await enablePush();
      haptic("success");
      toast.success("Notifications enabled");
    } catch (e) {
      haptic("warn");
      toast.error(e instanceof Error ? e.message : "Could not enable notifications");
    }
  }

  function openGroup(id: string) {
    haptic("select");
    navigate(`/group/${id}`);
  }

  function addGroup(g: Group) {
    rememberGroup(g.id);
    setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]));
  }

  // Net stats across all the user's groups.
  const myBalance = (g: Group) => Number(g.members.find((m) => m.user_id === user?.id)?.balance ?? 0);
  const totalBalance = groups.reduce((s, g) => s + myBalance(g), 0);
  const totalStart = groups.reduce((s, g) => s + Number(g.starting_credits), 0);
  const pnl = totalBalance - totalStart;

  return (
    <div className="animate-fade-up space-y-6">
      {portfolio && rangePoints.length >= 2 ? (
        (() => {
          const shownV = scrubIndex != null && rangePoints[scrubIndex] ? rangePoints[scrubIndex].v : portfolio.balance;
          const shownPnl = shownV - portfolio.start;
          const scrubbed = scrubIndex != null ? rangePoints[scrubIndex] : null;
          const pct = portfolio.start ? (shownPnl / portfolio.start) * 100 : 0;
          return (
            <section>
              <div className="font-mono text-[2.8rem] font-extrabold leading-none tracking-tight tabular-nums">{fmt(shownV)}</div>
              <div className="mt-1.5 text-sm font-mono font-semibold tabular-nums">
                <span className={shownPnl >= 0 ? "text-yes" : "text-no"}>
                  {shownPnl >= 0 ? "+" : ""}{fmt(shownPnl)} ({shownPnl >= 0 ? "+" : ""}{pct.toFixed(2)}%)
                </span>
                {scrubbed && (
                  <span className="ml-2 font-sans font-normal text-muted-foreground/70">
                    {new Date(scrubbed.t).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>

              {/* edge-to-edge, breaking the page gutter */}
              <div className="-mx-4 mt-3">
                <PortfolioChart points={rangePoints} start={portfolio.start} scrubIndex={scrubIndex} onScrub={setScrubIndex} />
              </div>

              <div className="mt-3 flex gap-1.5">
                {RANGES.map((r) => (
                  <button
                    key={r.k}
                    onClick={() => { setRange(r.k); setScrubIndex(null); haptic("select"); }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition-colors",
                      range === r.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </section>
          );
        })()
      ) : groups.length > 0 ? (
        <div className="rounded-2xl bg-card p-5">
          <div className="font-mono text-4xl font-extrabold tabular-nums">{fmt(totalBalance)}</div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="font-mono font-semibold tabular-nums">{groups.length}</span> <span className="text-muted-foreground">{groups.length === 1 ? "group" : "groups"}</span></span>
            <span className={pnl >= 0 ? "text-yes" : "text-no"}>
              <span className="font-mono font-semibold tabular-nums">{pnl >= 0 ? "+" : ""}{fmt(pnl)}</span>{" "}
              <span className="text-muted-foreground">P&amp;L</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your groups</h1>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="tactile active:scale-95" onClick={() => { haptic("tap"); setJoinOpen(true); }}>Join</Button>
          <Button size="sm" className="tactile active:scale-95" onClick={() => { haptic("tap"); setNewOpen(true); }}><Plus className="size-4" /> New</Button>
          <Button variant="ghost" size="icon" aria-label="Enable notifications" className="tactile size-8 active:scale-95" onClick={onBell}><Bell className="size-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No groups yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new pool or join one with an invite code.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/[0.06] dark:divide-white/[0.09]">
          {groups.map((g) => {
            const me = g.members.find((m) => m.user_id === user?.id);
            const bal = Number(me?.balance ?? 0);
            const glpnl = bal - Number(g.starting_credits);
            return (
              <button
                key={g.id}
                onClick={() => openGroup(g.id)}
                className="flex w-full items-center gap-3 py-5 text-left transition-transform active:scale-[0.99]"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ backgroundImage: avatarGradient(g.id) }}>
                  {g.name.trim().slice(0, 1).toUpperCase() || "•"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{g.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {g.members.length} {g.members.length === 1 ? "member" : "members"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="font-mono text-[15px] font-bold tabular-nums">{fmt(bal)}</div>
                  {glpnl !== 0 && (
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums", glpnl >= 0 ? "bg-yes text-white" : "bg-no text-white")}>
                      {glpnl >= 0 ? "+" : ""}{fmt(glpnl)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <NewGroupDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(g) => {
          addGroup(g);
          openGroup(g.id);
        }}
      />
      <JoinGroupDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={(g) => {
          addGroup(g);
          openGroup(g.id);
        }}
      />
    </div>
  );
}

function NewGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (g: Group) => void;
}) {
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("1000");
  const [window, setWindow] = useState("12");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Give your group a name");
      return;
    }
    setBusy(true);
    haptic("tap");
    try {
      const g = await api<Group>("POST", "/groups", {
        name: name.trim(),
        starting_credits: Number(credits) || 0,
        dispute_window_hours: Number(window) || 0,
      });
      haptic("success");
      onOpenChange(false);
      setName("");
      onCreated(g);
    } catch (e) {
      haptic("warn");
      toast.error(e instanceof ApiError ? e.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Set up a pool and invite your friends.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ng-name">Name</Label>
            <Input
              id="ng-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend crew"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ng-credits">Starting credits</Label>
              <Input
                id="ng-credits"
                type="number"
                inputMode="numeric"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ng-window">Dispute window (hrs)</Label>
              <Input
                id="ng-window"
                type="number"
                inputMode="numeric"
                value={window}
                onChange={(e) => setWindow(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            className="tactile active:scale-95"
            disabled={busy}
            onClick={submit}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinGroupDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJoined: (g: Group) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invite_code = code.trim().toUpperCase();
    if (!invite_code) {
      toast.error("Enter an invite code");
      return;
    }
    setBusy(true);
    haptic("tap");
    try {
      const g = await api<Group>("POST", "/groups/join", { invite_code });
      haptic("success");
      onOpenChange(false);
      setCode("");
      onJoined(g);
    } catch (e) {
      haptic("warn");
      toast.error(e instanceof ApiError ? e.message : "Could not join group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>Join with code</DialogTitle>
          <DialogDescription>Enter the invite code someone shared with you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="jg-code">Invite code</Label>
          <Input
            id="jg-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoFocus
            className="uppercase tracking-widest"
          />
        </div>
        <DialogFooter>
          <Button
            className="tactile active:scale-95"
            disabled={busy}
            onClick={submit}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Join group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
