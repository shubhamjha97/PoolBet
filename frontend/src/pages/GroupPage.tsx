import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Loader2, Share2, TrendingUp, Trophy, BarChart3, Scale, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { AccessRequest, Group, Market, TimelineEvent } from "@/lib/types";
import { fmt } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { useGroupStream } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketsTab } from "@/components/market/MarketsTab";
import { StatsTab } from "@/components/group/StatsTab";
import { TimelineTab } from "@/components/group/TimelineTab";
import { LiveFeed } from "@/components/group/LiveFeed";
import { LeaderboardTab } from "@/components/group/LeaderboardTab";
import { SettleTab } from "@/components/group/SettleTab";
import { ShareSheet } from "@/components/ShareSheet";
import { WinCard } from "@/components/WinCard";
import { celebrateWin } from "@/lib/celebrate";

function rememberGroup(id: string) {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem("pb_groups") || "[]");
    if (!ids.includes(id)) localStorage.setItem("pb_groups", JSON.stringify([...ids, id]));
  } catch { /* ignore */ }
}

export function GroupPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        api<Group>("GET", `/groups/${id}`),
        api<Market[]>("GET", `/groups/${id}/markets`),
      ]);
      setGroup(g);
      setMarkets(m);
      // owner-only; 403 for members → ignore
      try { setRequests(await api<AccessRequest[]>("GET", `/groups/${id}/access-requests`)); } catch { setRequests([]); }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load group");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { rememberGroup(id); refresh(); }, [id, refresh]);

  // Live activity: append to the banter feed + debounce a data refresh so odds
  // bars pulse live when anyone in the group bets.
  const [liveEvents, setLiveEvents] = useState<TimelineEvent[]>([]);
  const [win, setWin] = useState<{ amount: number; question: string } | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWinQuestion = useRef<string | null>(null); // a settlement is landing; watch for a balance bump
  const prevBalance = useRef<number | null>(null);
  useGroupStream(id, (e) => {
    setLiveEvents((prev) => {
      // Drop the optimistic placeholder once the real comment streams back.
      const deduped = e.type === "comment"
        ? prev.filter((p) => !(p.id.startsWith("local-") && p.type === "comment" && p.payload?.text === e.payload?.text))
        : prev;
      return [e, ...deduped].slice(0, 20);
    });
    if (e.type === "market_settled") {
      pendingWinQuestion.current = (e.payload?.market_question as string) || "your bet";
    }
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => refresh(), 400);
  });

  // Optimistic comment: the author sees their own line immediately, without
  // waiting on the SSE round-trip (which can lag under load).
  const addLocalComment = useCallback((text: string) => {
    const optimistic: TimelineEvent = {
      id: `local-${Date.now()}`,
      ts: new Date().toISOString(),
      type: "comment",
      actor_name: user?.name ?? "You",
      market_id: null,
      payload: { text, actor_name: user?.name ?? "You" },
    };
    setLiveEvents((prev) => [optimistic, ...prev].slice(0, 20));
  }, [user?.name]);

  // Seed the activity feed with recent history so it's never empty on arrival.
  useEffect(() => {
    api<TimelineEvent[]>("GET", `/groups/${id}/timeline`).then((evs) => setLiveEvents(evs.slice(0, 12))).catch(() => {});
  }, [id]);

  // Celebrate when a just-settled market pays the current user (their balance jumps).
  useEffect(() => {
    const meNow = group?.members.find((m) => m.user_id === user?.id);
    const bal = meNow ? Number(meNow.balance) : null;
    if (bal == null) return;
    if (pendingWinQuestion.current != null && prevBalance.current != null) {
      if (bal > prevBalance.current + 0.009) {
        const amount = bal - prevBalance.current;
        const question = pendingWinQuestion.current;
        setWin({ amount, question });
        celebrateWin({ amount, question });
      }
      pendingWinQuestion.current = null;
    }
    prevBalance.current = bal;
  }, [group, user?.id]);

  if (loading) return <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  if (!group) return <div className="text-muted-foreground">Group not found.</div>;

  const me = group.members.find((m) => m.user_id === user?.id);

  const buyIn = () => api("POST", `/groups/${id}/buy-in`).then(() => { toast.success("Bought in"); haptic("success"); refresh(); }).catch((e) => toast.error(e.message));
  const approve = (reqId: string) => api("POST", `/groups/${id}/access-requests/${reqId}/approve`).then(() => { toast.success("Approved"); refresh(); }).catch((e) => toast.error(e.message));
  return (
    <div className="space-y-5 pb-12">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> groups</Link>
        {/* Robinhood-style left-aligned hero stack */}
        <h1 className="mt-2 text-xl font-semibold tracking-tight opacity-90">{group.name}</h1>
        <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">your balance</div>
        <div className="font-mono text-[2.7rem] font-extrabold leading-none tracking-tight tabular-nums">{me ? fmt(me.balance) : "—"}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="tactile active:scale-95" onClick={() => { setShareOpen(true); haptic("select"); }}>
            <Share2 className="size-3.5" /> Share
          </Button>
          <Button variant="outline" size="sm" className="tactile active:scale-95" onClick={buyIn}><Plus className="size-3.5" /> Buy in</Button>
          <span data-testid="invite-code" className="sr-only">{group.invite_code}</span>
        </div>
      </div>

      {requests.length > 0 && (
        <div className="rounded-xl border border-primary/30 p-4">
          <div className="mb-2 text-sm font-semibold">Access requests ({requests.length})</div>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-t py-2 first:border-0">
              <span>{r.name}</span>
              <Button size="sm" className="tactile active:scale-95" onClick={() => approve(r.id)}>Approve</Button>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="markets" onValueChange={() => haptic("select")}>
        <TabsList className="fixed inset-x-0 bottom-0 z-40 grid h-[4.25rem] w-full grid-cols-5 gap-0 rounded-none border-0 border-t border-white/10 bg-background/80 p-0 pb-safe backdrop-blur-xl">
          {[
            { v: "markets", label: "Markets", Icon: TrendingUp },
            { v: "ranks", label: "Ranks", Icon: Trophy },
            { v: "stats", label: "Stats", Icon: BarChart3 },
            { v: "settle", label: "Settle", Icon: Scale },
            { v: "timeline", label: "Log", Icon: ScrollText },
          ].map(({ v, label, Icon }) => (
            <TabsTrigger key={v} value={v} aria-label={label}
              className="flex h-full items-center justify-center rounded-none bg-transparent text-muted-foreground shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              <Icon className="size-6" strokeWidth={2} />
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="markets" className="mt-2">
          <LiveFeed events={liveEvents} groupId={id} onLocalEcho={addLocalComment} />
          <div className="mt-5">
            <MarketsTab group={group} markets={markets} onRefresh={refresh} openMarketId={params.get("market")} />
          </div>
        </TabsContent>
        <TabsContent value="ranks" className="mt-2">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight">Ranks</h2>
          <LeaderboardTab groupId={id} />
        </TabsContent>
        <TabsContent value="stats" className="mt-2">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight">Stats</h2>
          <StatsTab group={group} markets={markets} />
        </TabsContent>
        <TabsContent value="settle" className="mt-2">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight">Settle up</h2>
          <SettleTab groupId={id} groupName={group.name} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-2">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight">Log</h2>
          <TimelineTab groupId={id} />
        </TabsContent>
      </Tabs>

      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} title={`Invite to ${group.name}`} url={`${location.origin}/#/group/${id}`} code={group.invite_code} />
      <WinCard open={!!win} onOpenChange={(v) => !v && setWin(null)} amount={win?.amount ?? 0} question={win?.question ?? ""} groupName={group.name} />
    </div>
  );
}
