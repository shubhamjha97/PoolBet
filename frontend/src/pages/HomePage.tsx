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
import { Card } from "@/components/ui/card";
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
          return (
            <section>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Net balance</div>
              <div className="mt-1 font-mono text-4xl font-bold tabular-nums">{fmt(shownV)}</div>
              <div className="mt-1 text-sm">
                <span className={shownPnl >= 0 ? "text-yes" : "text-no"}>
                  <span className="font-mono font-semibold tabular-nums">{shownPnl >= 0 ? "+" : ""}{fmt(shownPnl)}</span>
                </span>{" "}
                <span className="text-muted-foreground">
                  {scrubbed ? new Date(scrubbed.t).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "all-time P&L"}
                </span>
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
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Net balance</div>
          <div className="mt-1 font-mono text-4xl font-bold tabular-nums">{fmt(totalBalance)}</div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="font-mono font-semibold tabular-nums">{groups.length}</span> <span className="text-muted-foreground">{groups.length === 1 ? "group" : "groups"}</span></span>
            <span className={pnl >= 0 ? "text-yes" : "text-no"}>
              <span className="font-mono font-semibold tabular-nums">{pnl >= 0 ? "+" : ""}{fmt(pnl)}</span>{" "}
              <span className="text-muted-foreground">P&amp;L</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your groups</h1>
        <p className="text-muted-foreground">Pools you play in. Create one or join with a code.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          className="tactile active:scale-95"
          onClick={() => {
            haptic("tap");
            setNewOpen(true);
          }}
        >
          <Plus className="size-4" />
          New group
        </Button>
        <Button
          variant="outline"
          className="tactile active:scale-95"
          onClick={() => {
            haptic("tap");
            setJoinOpen(true);
          }}
        >
          Join with code
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Enable notifications"
          className="ml-auto tactile active:scale-95"
          onClick={onBell}
        >
          <Bell className="size-4" />
        </Button>
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
        <div className="space-y-3">
          {groups.map((g) => {
            const me = g.members.find((m) => m.user_id === user?.id);
            return (
              <Card
                key={g.id}
                role="button"
                tabIndex={0}
                onClick={() => openGroup(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openGroup(g.id);
                  }
                }}
                className="tactile flex cursor-pointer items-center justify-between p-4 transition-colors hover:border-primary/40 active:scale-[0.98]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-yes to-no text-base font-bold text-black shadow-[0_3px_14px_-3px_hsl(var(--no)/0.5)]">
                    {g.name.trim().slice(0, 1).toUpperCase() || "•"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{g.name}</div>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground">
                      {g.members.length} {g.members.length === 1 ? "member" : "members"} · code{" "}
                      {g.invite_code}
                    </div>
                  </div>
                </div>
                {me && (
                  <div className="ml-3 shrink-0 text-right">
                    <div className="text-lg font-semibold font-mono tabular-nums">{fmt(me.balance)}</div>
                    <div className="text-xs text-muted-foreground">balance</div>
                  </div>
                )}
              </Card>
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
