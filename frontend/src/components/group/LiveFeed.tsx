import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Send, SmilePlus } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { fmt, timeAgo } from "@/lib/format";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
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

const QUICK_REACTIONS = ["🔥", "😂", "🎉"];

export function LiveFeed({ events, groupId, onLocalEcho }: {
  events: TimelineEvent[];
  groupId: string;
  onLocalEcho?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rx, setRx] = useState<{ counts: Record<string, Record<string, number>>; mine: Record<string, string[]> }>({ counts: {}, mine: {} });
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<typeof rx>("GET", `/groups/${groupId}/reactions`).then((r) => { if (alive) setRx(r); }).catch(() => {});
    return () => { alive = false; };
  }, [groupId, events.length]);

  const react = async (eventId: string, emoji: string) => {
    haptic("select");
    try { setRx(await api("POST", `/events/${eventId}/react`, { emoji })); } catch { /* ignore */ }
  };

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
      <div className="divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {events.slice(0, 6).map((e) => {
            const present = Object.entries(rx.counts[e.id] || {}).filter(([, n]) => n > 0);
            const picking = pickerFor === e.id;
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.34, 1.4, 0.5, 1] }}
                className="py-3 text-sm first:pt-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={e.type === "comment" ? "min-w-0 truncate font-medium" : "min-w-0 truncate text-muted-foreground"}>{describe(e)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground/70">{timeAgo(e.ts)}</span>
                </div>
                {!e.id.startsWith("local-") && (present.length > 0 || picking) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {present.map(([em, n]) => (
                      <button key={em} onClick={() => react(e.id, em)}
                        className={cn("rounded-full border px-1.5 py-px text-xs leading-5 transition-colors active:scale-90",
                          (rx.mine[e.id] || []).includes(em) ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
                        {em}<span className="ml-0.5 tabular-nums">{n}</span>
                      </button>
                    ))}
                    {picking && QUICK_REACTIONS.filter((q) => !present.some(([em]) => em === q)).map((em) => (
                      <button key={em} onClick={() => { react(e.id, em); setPickerFor(null); }} className="rounded-full px-1 text-sm hover:bg-secondary active:scale-90">{em}</button>
                    ))}
                  </div>
                )}
                {!e.id.startsWith("local-") && !picking && (
                  <button onClick={() => setPickerFor(e.id)} aria-label="React"
                    className="mt-1 inline-flex items-center text-muted-foreground/40 transition-colors hover:text-muted-foreground active:scale-90">
                    <SmilePlus className="size-3.5" />
                  </button>
                )}
              </motion.div>
            );
          })}
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
        <Button size="icon" className="tap-target tactile active:scale-95" disabled={busy || !text.trim()} onClick={send} aria-label="Send comment">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
