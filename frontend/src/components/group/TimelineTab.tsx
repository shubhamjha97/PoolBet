import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TimelineEvent } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

function describe(e: TimelineEvent) {
  const p = (e.payload || {}) as P;
  const who = s(e.actor_name) || "Someone";
  const mq = p.market_question ? ` — ${s(p.market_question)}` : "";
  switch (e.type) {
    case "bet_placed": {
      const name = p.anonymous ? s(p.nickname_or_name) || "An anonymous bettor" : who;
      const side = s(p.side);
      return <>{<b>{name}</b>} bet <b>{fmt(s(p.amount) || 0)}</b> on <b className={side === "YES" ? "text-yes" : "text-no"}>{side}</b>{mq}</>;
    }
    case "market_created": return <><b>{who}</b> opened a market{p.question ? ` — ${s(p.question)}` : ""}</>;
    case "market_resolved":
    case "market_settled": return <>Resolved <b>{s(p.outcome)}</b>{p.fraction != null ? ` (${Math.round(Number(p.fraction) * 100)}%)` : ""}{mq}</>;
    case "buy_in": return <><b>{who}</b> bought in for <b>{fmt(s(p.amount) || 0)}</b></>;
    case "group_join": return <><b>{s(p.name) || who}</b> joined</>;
    case "group_create": return <><b>{who}</b> created the group</>;
    case "access_approved": return <><b>{s(p.name) || who}</b> was let in</>;
    case "evidence_added": return <><b>{who}</b> added photo evidence{mq}</>;
    case "rollback": return <b>State rolled back</b>;
    default: return <><b>{who}</b> · {e.type}</>;
  }
}

export function TimelineTab({ groupId }: { groupId: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { api<TimelineEvent[]>("GET", `/groups/${groupId}/timeline`).then(setEvents).catch(() => setFailed(true)); }, [groupId]);

  if (failed) return <p className="text-sm text-muted-foreground">Timeline unavailable.</p>;
  if (!events) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!events.length) return <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>;

  return (
    <div className="space-y-0">
      {events.map((e, i) => (
        <div key={e.id} className="relative flex gap-3 pb-4">
          {i < events.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-border" />}
          <span className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          <div className="min-w-0 flex-1">
            <div className="text-sm">{describe(e)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{timeAgo(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
