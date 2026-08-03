import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Loader2, Share2 } from "lucide-react";
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
    <div className="animate-fade-up space-y-5">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> groups</Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">your balance</div>
            <div className="text-2xl font-bold font-mono tabular-nums">{me ? fmt(me.balance) : "—"}</div>
            <Button variant="outline" size="sm" className="tactile mt-1 active:scale-95" onClick={buyIn}><Plus className="size-3.5" /> Buy in</Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">invite code</span>
          <span data-testid="invite-code" className="rounded-md border bg-secondary px-2.5 py-1 font-mono tracking-widest text-primary">{group.invite_code}</span>
          <Button size="sm" className="tactile ml-auto active:scale-95" onClick={() => { setShareOpen(true); haptic("select"); }}><Share2 className="size-3.5" /> Share</Button>
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

      <LiveFeed events={liveEvents} groupId={id} onLocalEcho={addLocalComment} />

      <Tabs defaultValue="markets">
        <TabsList className="w-full">
          <TabsTrigger value="markets" className="flex-1">Markets</TabsTrigger>
          <TabsTrigger value="ranks" className="flex-1">Ranks</TabsTrigger>
          <TabsTrigger value="stats" className="flex-1">Stats</TabsTrigger>
          <TabsTrigger value="settle" className="flex-1">Settle</TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="markets" className="mt-4">
          <MarketsTab group={group} markets={markets} onRefresh={refresh} openMarketId={params.get("market")} />
        </TabsContent>
        <TabsContent value="ranks" className="mt-4">
          <LeaderboardTab groupId={id} />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab group={group} markets={markets} />
        </TabsContent>
        <TabsContent value="settle" className="mt-4">
          <SettleTab groupId={id} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab groupId={id} />
        </TabsContent>
      </Tabs>

      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} title={`Invite to ${group.name}`} url={`${location.origin}/#/group/${id}`} code={group.invite_code} />
      <WinCard open={!!win} onOpenChange={(v) => !v && setWin(null)} amount={win?.amount ?? 0} question={win?.question ?? ""} groupName={group.name} />
    </div>
  );
}
