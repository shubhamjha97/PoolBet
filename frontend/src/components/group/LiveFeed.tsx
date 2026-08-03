import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";

const s = (v: unknown) => (v == null ? "" : String(v));

function describe(e: TimelineEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  const who = p.anonymous ? s(p.nickname_or_name) || "Someone anonymous" : s(e.actor_name) || "Someone";
  switch (e.type) {
    case "bet_placed": return `${who} bet ${fmt(s(p.amount) || 0)} on ${s(p.side)}`;
    case "market_created": return `${who} opened “${s(p.question)}”`;
    case "market_resolved":
    case "market_settled": return `Resolved ${s(p.outcome)}${p.market_question ? ` — ${s(p.market_question)}` : ""}`;
    case "buy_in": return `${who} bought in for ${fmt(s(p.amount) || 0)}`;
    case "group_join": return `${s(p.name) || who} joined`;
    case "access_approved": return `${s(p.name) || who} was let in`;
    case "rollback": return `State rolled back`;
    default: return `${who} · ${e.type}`;
  }
}

export function LiveFeed({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Radio className="size-3 animate-pulse text-yes" /> Live
      </div>
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {events.slice(0, 6).map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.34, 1.4, 0.5, 1] }}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">{describe(e)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.ts)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
