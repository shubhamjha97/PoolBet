import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Check, Share2 } from "lucide-react";

interface NetEntry {
  user_id: string;
  name: string;
  net: number;
}

interface Transfer {
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
}

interface Settlement {
  net: NetEntry[];
  transfers: Transfer[];
  house_take: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

export function SettleTab({ groupId, groupName }: { groupId: string; groupName?: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function shareSettleUp() {
    if (!data) return;
    haptic("select");
    const standings = [...data.net].sort((a, b) => b.net - a.net)
      .map((n) => `  ${n.name}: ${n.net >= 0 ? "+" : ""}${fmt(n.net)}`).join("\n");
    const transfers = data.transfers.length
      ? data.transfers.map((t) => `  ${t.from_name} → ${t.to_name}: ${fmt(t.amount)}`).join("\n")
      : "  Everyone's even 🎉";
    const text = `🧾 ${groupName ?? "PoolBet"} — settle up\n\nStandings:\n${standings}\n\nWho pays who:\n${transfers}`;
    try {
      if (navigator.share) { await navigator.share({ title: "PoolBet settle-up", text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success("Copied settle-up to clipboard");
    } catch { /* user cancelled share */ }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api<Settlement>("GET", `/groups/${groupId}/settlement`)
      .then((s) => {
        if (alive) setData(s);
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
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading settlement…</p>;
  }

  if (error || !data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load the settlement. Try again shortly.
      </p>
    );
  }

  const standings = [...data.net].sort((a, b) => b.net - a.net);

  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>Standings</SectionLabel>
        <div className="rounded-xl border bg-card divide-y">
          {standings.map((m) => {
            const you = m.user_id === user?.id;
            const positive = m.net >= 0;
            return (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">
                  <span className="font-bold text-foreground">{m.name}</span>
                  {you && <span className="ml-1 text-muted-foreground">(you)</span>}
                </span>
                <span
                  className={`font-mono tabular-nums text-sm font-medium ${positive ? "text-yes" : "text-no"}`}
                >
                  {positive ? "+" : "-"}
                  {fmt(Math.abs(m.net))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel>Settle up</SectionLabel>
        <p className="mb-3 text-xs text-muted-foreground">
          Cash out the season — who pays who to settle all balances.
        </p>
        {data.transfers.length === 0 ? (
          <Card className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-yes" />
            <span>Everyone&apos;s even</span>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.transfers.map((t, i) => (
              <Card
                key={i}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="truncate font-medium text-no">{t.from_name}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium text-yes">{t.to_name}</span>
                </div>
                <span className="shrink-0 font-mono tabular-nums text-sm font-bold text-foreground">
                  {fmt(t.amount)}
                </span>
              </Card>
            ))}
          </div>
        )}
        <Button variant="outline" className="tactile mt-3 w-full active:scale-95" onClick={shareSettleUp}>
          <Share2 className="size-4" /> Share settle-up
        </Button>
      </section>

      {data.house_take > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          The house has taken <span className="font-mono tabular-nums text-foreground">{fmt(data.house_take)}</span> in rake from settled pots.
        </p>
      )}
    </div>
  );
}
