import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const s = (v: unknown) => (v == null ? "" : String(v));

function describe(e: TimelineEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  const who = p.anonymous ? s(p.nickname_or_name) || "Someone anonymous" : s(e.actor_name) || "Someone";
  switch (e.type) {
    case "comment": return `${who}: ${s(p.text)}`;
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

export function LiveFeed({ events, groupId, onLocalEcho }: {
  events: TimelineEvent[];
  groupId: string;
  onLocalEcho?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    haptic("tap");
    setText("");
    onLocalEcho?.(t); // show it instantly; the SSE echo dedupes & replaces it
    try {
      await api("POST", `/groups/${groupId}/comments`, { text: t });
    } catch {
      /* ignore — the optimistic line stays; a refresh/echo reconciles */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Radio className="size-3 text-yes [animation:pb-live_1.8s_ease-in-out_infinite]" /> Live
      </div>
      <div className="space-y-2">
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
              <span className={e.type === "comment" ? "min-w-0 truncate font-medium" : "min-w-0 truncate text-muted-foreground"}>{describe(e)}</span>
              <span className="shrink-0 text-xs text-muted-foreground/70">{timeAgo(e.ts)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {events.length === 0 && <p className="py-1 text-sm text-muted-foreground">No activity yet — say something.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Add a comment…"
          maxLength={500}
          aria-label="Comment"
        />
        <Button size="sm" className="tactile shrink-0 px-4 active:scale-95" disabled={busy || !text.trim()} onClick={send} aria-label="Send comment">
          Send
        </Button>
      </div>
    </div>
  );
}
