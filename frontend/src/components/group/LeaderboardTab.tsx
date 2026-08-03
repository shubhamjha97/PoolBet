import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Crown, Flame, TrendingUp, Trophy, Zap } from "lucide-react";

interface Entry {
  user_id: string;
  name: string;
  balance: string;
  pnl: number;
  roi: number;
  wins: number;
  losses: number;
  streak: number;
  badges: string[];
}

// Badge metadata: label + icon + accent classes, keyed by the backend badge id.
const BADGES: Record<string, { label: string; icon: typeof Trophy; cls: string }> = {
  leader: { label: "Leader", icon: Crown, cls: "border-amber-400/40 bg-amber-400/10 text-amber-500" },
  hot: { label: "Hot", icon: Flame, cls: "border-orange-400/40 bg-orange-400/10 text-orange-500" },
  sharp: { label: "Sharp", icon: TrendingUp, cls: "border-emerald-400/40 bg-emerald-400/10 text-yes" },
  whale: { label: "Whale", icon: Trophy, cls: "border-sky-400/40 bg-sky-400/10 text-sky-500" },
  contrarian: { label: "Contrarian", icon: Zap, cls: "border-pink-400/40 bg-pink-400/10 text-no" },
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function LeaderboardTab({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const [board, setBoard] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api<Entry[]>("GET", `/groups/${groupId}/leaderboard`)
      .then((b) => {
        if (alive) setBoard(b);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading leaderboard…</p>;
  }

  if (error || !board) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load the leaderboard. Try again shortly.
      </p>
    );
  }

  if (board.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <div className="space-y-2">
      {board.map((e, i) => {
        const you = e.user_id === user?.id;
        const positive = e.pnl >= 0;
        return (
          <Card key={e.user_id} className="flex items-center gap-3 px-3 py-2.5">
            {/* Rank: medal for top 3, number otherwise. */}
            <div className="w-6 shrink-0 text-center font-mono tabular-nums text-sm text-muted-foreground">
              {i < 3 ? <span className="text-base">{MEDALS[i]}</span> : i + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="truncate font-bold text-foreground">{e.name}</span>
                {you && <span className="text-xs text-muted-foreground">(you)</span>}
                {e.streak > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-orange-500">
                    <Flame className="size-3" />
                    {e.streak}
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {e.wins}W · {e.losses}L
                </span>
                {e.badges.map((id) => {
                  const b = BADGES[id];
                  if (!b) return null;
                  const Icon = b.icon;
                  return (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}
                    >
                      <Icon className="size-2.5" />
                      {b.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div
                className={`font-mono tabular-nums text-sm font-bold ${positive ? "text-yes" : "text-no"}`}
              >
                {positive ? "+" : "-"}
                {fmt(Math.abs(e.pnl))}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-muted-foreground">
                {fmt(e.balance)}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
