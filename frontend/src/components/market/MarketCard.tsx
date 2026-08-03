import { useEffect, useRef, useState, type MouseEvent } from "react";
import { motion, useAnimationControls } from "framer-motion";
import {
  ChevronDown, Share2, Camera, Copy, Swords, TrendingUp, Minus, Plus, RotateCcw, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { api, upload } from "@/lib/api";
import type { Bet, Market, Side } from "@/lib/types";
import { fmt, closesInfo, poolPct, oddsSeries } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ProbabilityChart } from "@/components/Charts";
import { Button } from "@/components/ui/button";
import { SlideToConfirm } from "@/components/market/SlideToConfirm";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ShareSheet } from "@/components/ShareSheet";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  CLOSED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RESOLVING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  DISPUTED: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  RESOLVED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

/** YES/NO bar with spring-physics width + neon glow; pulses on new volume. */
function AnimatedOddsBar({ yesPct, total }: { yesPct: number; total: number }) {
  const controls = useAnimationControls();
  const prev = useRef(total);
  useEffect(() => {
    if (total > prev.current) {
      controls.start({ scale: [1, 1.04, 1], transition: { duration: 0.5, ease: "easeOut" } });
    }
    prev.current = total;
  }, [total, controls]);

  const spring = { type: "spring" as const, stiffness: 120, damping: 20 };
  // Static gradient (no infinite background-position animation — that repaints
  // every frame on every card and murders iOS Safari). Spring width + a pulse on
  // new volume keep it lively where it matters.
  return (
    <motion.div animate={controls} className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800/80 p-0.5">
      <motion.div className="h-full rounded-l-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.4)]" animate={{ width: `${yesPct}%` }} initial={false} transition={spring} />
      <motion.div className="h-full rounded-r-full bg-gradient-to-l from-pink-600 to-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.4)]" animate={{ width: `${100 - yesPct}%` }} initial={false} transition={spring} />
    </motion.div>
  );
}

export function MarketCard({ market, onRefresh, defaultOpen }: { market: Market; onRefresh: () => void; defaultOpen?: boolean }) {
  const { user } = useAuth();
  const isMulti = !!market.outcomes?.length;
  const [open, setOpen] = useState(!!defaultOpen);
  const [side, setSide] = useState<Side>("YES");
  const [pick, setPick] = useState<string>(market.outcomes?.[0] ?? "");
  const [amount, setAmount] = useState(0);
  const [anon, setAnon] = useState(false);
  const [pct, setPct] = useState(50);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { total: binaryTotal, yes } = poolPct(market);
  const total = isMulti ? market.outcome_pools.reduce((s, o) => s + Number(o.pool), 0) : binaryTotal;
  const ci = closesInfo(market.closes_at);
  const isProposer = market.proposer_user_id === user?.id;
  const bettable = market.status === "OPEN" && !ci.closed;

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    haptic("tap");
    try {
      await fn();
      if (ok) toast.success(ok);
      haptic("success");
      onRefresh();
    } catch (e) {
      haptic("warn");
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const setAmt = (v: number) => setAmount(Math.max(0, Math.round(v)));

  // action cards: seed the bet form from an existing bet
  const match = (b: Bet) => { if (b.side) setSide(b.side); if (b.outcome) setPick(b.outcome); setAmt(Number(b.amount)); setOpen(true); haptic("select"); };
  const fade = (b: Bet) => { setSide(b.side === "YES" ? "NO" : "YES"); setAmt(Number(b.amount)); haptic("select"); };
  const raise = (b: Bet) => { if (b.side) setSide(b.side); if (b.outcome) setPick(b.outcome); setAmt(Math.round(Number(b.amount) * 1.5)); haptic("select"); };

  const openShare = (e: MouseEvent) => {
    e.stopPropagation();
    setShareOpen(true);
    haptic("select");
  };

  const probPts = oddsSeries(market.bets);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm dark:shadow-glass">
      <button className="w-full p-4 text-left" onClick={() => { setOpen((o) => !o); haptic("select"); }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 font-medium">{market.question}</div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tap-target flex items-center justify-center rounded-md text-muted-foreground hover:text-primary" onClick={openShare} role="button" aria-label="Share market"><Share2 className="size-4" /></span>
            <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", STATUS_STYLES[market.status])}>
              {market.status === "OPEN" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {market.status}
            </span>
          </div>
        </div>
        {isMulti ? (
          <div className="mt-3 space-y-1">
            {market.outcome_pools.slice(0, 3).map((o) => {
              const p = o.pct ? Math.round(Number(o.pct) * 100) : 0;
              return (
                <div key={o.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 truncate font-medium">{o.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800/80">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${p}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{p}%</span>
                </div>
              );
            })}
            {market.outcomes!.length > 3 && <div className="pl-20 text-[11px] text-muted-foreground">+{market.outcomes!.length - 3} more</div>}
          </div>
        ) : (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between font-mono text-xs font-bold">
              <span className="text-yes">YES {total > 0 ? yes + "%" : "—"}</span>
              <span className="text-no">{total > 0 ? 100 - yes + "%" : "—"} NO</span>
            </div>
            <AnimatedOddsBar yesPct={total > 0 ? yes : 50} total={total} />
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>{market.status === "RESOLVED" ? `resolved · ${market.outcome}` : ci.text} · pot {fmt(total)}</span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 animate-fade-up">
          <p className="mb-3 text-xs text-muted-foreground">by {market.proposer_name} · pot {fmt(total)}</p>

          {probPts.length >= 2 && (
            <div className="mb-3 rounded-lg bg-secondary p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Odds over time</div>
              <ProbabilityChart points={probPts} />
            </div>
          )}

          {market.rules && (
            <div className="mb-3 rounded-lg bg-secondary p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rules</div>
              <div className="whitespace-pre-wrap text-sm">{market.rules}</div>
            </div>
          )}

          {market.evidence_url ? (
            <img src={market.evidence_url} alt="result evidence" className="mb-3 w-full rounded-lg" />
          ) : ci.closed ? (
            <label className="tactile mb-3 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm active:scale-95">
              <Camera className="size-4" /> Add photo evidence
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) act(() => upload(`/markets/${market.id}/evidence`, f), "Evidence added"); }} />
            </label>
          ) : null}

          {/* ---- contextual actions ---- */}
          {bettable && (
            <div className="space-y-3">
              {isMulti ? (
                <div className="grid grid-cols-2 gap-2">
                  {market.outcomes!.map((o) => (
                    <Button key={o} type="button" variant={pick === o ? "default" : "outline"} className={cn("tactile h-11 active:scale-95", pick === o && "bg-primary text-primary-foreground")} onClick={() => { setPick(o); haptic("select"); }}>{o}</Button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={side === "YES" ? "default" : "outline"} className={cn("tactile h-11 active:scale-95", side === "YES" && "bg-yes text-black hover:bg-yes/90")} onClick={() => { setSide("YES"); haptic("select"); }}>YES</Button>
                  <Button type="button" variant={side === "NO" ? "default" : "outline"} className={cn("tactile h-11 active:scale-95", side === "NO" && "bg-no text-white hover:bg-no/90")} onClick={() => { setSide("NO"); haptic("select"); }}>NO</Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" className="tap-target tactile active:scale-90" onClick={() => { setAmt(amount - 10); haptic("tap"); }}><Minus className="size-4" /></Button>
                <Input inputMode="numeric" className="h-11 text-center font-mono text-lg font-bold tabular-nums" value={amount} onChange={(e) => setAmt(Number(e.target.value) || 0)} />
                <Button type="button" size="icon" variant="outline" className="tap-target tactile active:scale-90" onClick={() => { setAmt(amount + 10); haptic("tap"); }}><Plus className="size-4" /></Button>
                <Button type="button" size="icon" variant="outline" className="tap-target tactile text-muted-foreground active:scale-90" onClick={() => { setAmt(0); haptic("tap"); }}><RotateCcw className="size-4" /></Button>
              </div>
              <div className="flex gap-2">
                {[25, 50, 100].map((v) => (
                  <Button key={v} type="button" variant="outline" size="sm" className="tactile flex-1 active:scale-95" onClick={() => { setAmt(amount + v); haptic("tap"); }}>+{v}</Button>
                ))}
              </div>
              <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Switch checked={anon} onCheckedChange={(v) => { setAnon(v); haptic("select"); }} />
                <Lock className="size-3.5" /> Bet anonymously
              </label>
              {isMulti ? (
                <SlideToConfirm
                  disabled={busy || amount <= 0 || !pick}
                  label={`Slide to bet ${fmt(amount)} on ${pick || "…"}`}
                  colorClass="bg-primary text-primary-foreground"
                  onConfirm={() => act(() => api("POST", `/markets/${market.id}/bets`, { outcome: pick, amount: String(amount), anonymous: anon }, { "Idempotency-Key": crypto.randomUUID() }), `Bet ${fmt(amount)} on ${pick}`)}
                />
              ) : (
                <SlideToConfirm
                  disabled={busy || amount <= 0}
                  label={`Slide to bet ${fmt(amount)} on ${side}`}
                  colorClass={side === "YES" ? "bg-yes text-black" : "bg-no text-white"}
                  onConfirm={() => act(() => api("POST", `/markets/${market.id}/bets`, { side, amount: String(amount), anonymous: anon }, { "Idempotency-Key": crypto.randomUUID() }), `Bet ${fmt(amount)} on ${side}`)}
                />
              )}
            </div>
          )}

          {ci.closed && (market.status === "OPEN" || market.status === "CLOSED") && (
            isProposer ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">You proposed this — mark the result. A dispute window opens after.</p>
                {isMulti ? (
                  <div className="flex flex-wrap gap-2">
                    {market.outcomes!.map((o) => (
                      <Button key={o} className="tactile h-11 flex-1 basis-[calc(50%-0.25rem)] active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: o }), `Marked ${o}`)}>{o} won</Button>
                    ))}
                    <Button variant="outline" className="tactile h-11 w-full active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: "VOID" }), "Voided")}>Void (refund all)</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button className="tactile h-11 flex-1 bg-yes text-black hover:bg-yes/90 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: "YES" }), "Marked YES")}>YES won</Button>
                      <Button className="tactile h-11 flex-1 bg-no text-white hover:bg-no/90 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: "NO" }), "Marked NO")}>NO won</Button>
                      <Button variant="outline" className="tactile h-11 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: "VOID" }), "Voided")}>Void</Button>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 flex justify-between text-sm"><span>Split result — YES share</span><span className="font-bold tabular-nums">{pct}%</span></div>
                      <Slider value={[pct]} min={0} max={100} step={1} onValueChange={(v) => { setPct(v[0]); haptic("select"); }} />
                      <Button variant="outline" className="tactile mt-3 w-full active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/resolve`, { outcome: "SCALAR", yes_percent: pct }), `Marked YES ${pct}%`)}>Settle at split %</Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">Betting closed. Waiting for the proposer to resolve.</div>
            )
          )}

          {market.status === "RESOLVING" && (
            <div className="space-y-3">
              <div className="flex justify-between rounded-lg bg-secondary p-3 text-sm"><span>Proposed outcome</span><b>{market.proposed_outcome}</b></div>
              <Input placeholder="Reason to dispute" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" className="tactile flex-1 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/dispute`, { reason: reason || "disputed" }), "Disputed")}>Dispute</Button>
                <Button className="tactile flex-1 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/settle`), "Settled")}>Settle now</Button>
              </div>
              <p className="text-xs text-muted-foreground">{isProposer ? "As proposer you can settle now, skipping the window." : "“Settle now” works once the window elapses."}</p>
            </div>
          )}

          {market.status === "DISPUTED" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Disputed — vote the outcome.</p>
              <div className="flex gap-2">
                {(["YES", "NO", "VOID"] as const).map((c) => (
                  <Button key={c} variant="outline" className="tactile flex-1 active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/vote`, { choice: c }), `Voted ${c}`)}>{c}</Button>
                ))}
              </div>
              <Button className="tactile w-full active:scale-95" disabled={busy} onClick={() => act(() => api("POST", `/markets/${market.id}/settle`), "Settled")}>Tally &amp; settle</Button>
            </div>
          )}

          {market.status === "RESOLVED" && (
            <div className="flex justify-between rounded-lg bg-secondary p-3">
              <span>Final outcome</span>
              <b className={market.outcome === "YES" ? "text-yes" : market.outcome === "NO" ? "text-no" : ""}>
                {market.outcome === "SCALAR" && market.outcome_fraction != null ? `YES ${Math.round(Number(market.outcome_fraction) * 100)}% / NO ${100 - Math.round(Number(market.outcome_fraction) * 100)}%` : market.outcome}
              </b>
            </div>
          )}

          {/* ---- bets + action cards ---- */}
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bets</div>
            {market.bets.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No bets yet.</p>
            ) : (
              <div className="space-y-1.5">
                {market.bets.map((b) => (
                  <div key={b.id} className="flex items-center justify-between border-t py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span>{b.member_name}</span>
                      {b.is_anonymous && <span className="rounded border px-1 text-[9px] uppercase text-muted-foreground">anon</span>}
                      <b className={b.outcome ? "text-primary" : b.side === "YES" ? "text-yes" : "text-no"}>{b.outcome ?? b.side}</b>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">{fmt(b.amount)}{b.payout != null && <> → <b>{fmt(b.payout)}</b></>}</span>
                      {bettable && (
                        <div className="flex gap-1">
                          <button className="tap-target tactile rounded p-1 text-muted-foreground hover:text-yes active:scale-90" title="Match" onClick={() => match(b)}><Copy className="size-3.5" /></button>
                          <button className="tap-target tactile rounded p-1 text-muted-foreground hover:text-no active:scale-90" title="Fade (go against)" onClick={() => fade(b)}><Swords className="size-3.5" /></button>
                          <button className="tap-target tactile rounded p-1 text-muted-foreground hover:text-primary active:scale-90" title="Raise" onClick={() => raise(b)}><TrendingUp className="size-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} title={market.question} url={`${location.origin}/#/market/${market.id}`} />
    </div>
  );
}
