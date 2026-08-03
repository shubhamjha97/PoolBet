import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Group, Market } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { MarketCard } from "./MarketCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const PRESETS: [string, number][] = [["1h", 1], ["6h", 6], ["1d", 24], ["3d", 72], ["7d", 168]];
const localDT = (hoursAhead: number) => {
  const d = new Date(Date.now() + hoursAhead * 3.6e6);
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};

export function MarketsTab({ group, markets, onRefresh, openMarketId }: { group: Group; markets: Market[]; onRefresh: () => void; openMarketId?: string | null }) {
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [rules, setRules] = useState("");
  const [closes, setCloses] = useState(localDT(24));
  const [preset, setPreset] = useState("1d");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return markets;
    return markets.filter((m) => m.question.toLowerCase().includes(s) || m.bets.some((b) => b.member_name.toLowerCase().includes(s)));
  }, [markets, q]);

  async function create() {
    if (question.trim().length < 3) return toast.error("Give the market a question");
    setBusy(true);
    haptic("tap");
    try {
      await api("POST", `/groups/${group.id}/markets`, {
        question: question.trim(),
        rules: rules.trim() || null,
        closes_at: new Date(closes).toISOString(),
      });
      haptic("success");
      setNewOpen(false); setQuestion(""); setRules("");
      onRefresh();
    } catch (e) {
      haptic("warn");
      toast.error(e instanceof Error ? e.message : "Could not create market");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search markets & bettors" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button className="tactile active:scale-95" onClick={() => { haptic("tap"); setNewOpen(true); }}><Plus className="size-4" /> New</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {markets.length ? "No markets match your search." : "No markets yet. Propose the first one."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MarketCard key={m.id} market={m} onRefresh={onRefresh} defaultOpen={m.id === openMarketId} />
          ))}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New market</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Question (YES / NO)</Label>
              <Input placeholder="Will the Chiefs cover the spread?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={280} />
            </div>
            <div className="space-y-1.5">
              <Label>Rules / how it resolves (optional)</Label>
              <Textarea placeholder="e.g. Resolves YES if the final margin is 3+ points." value={rules} onChange={(e) => setRules(e.target.value)} maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label>Closes at</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(([k, h]) => (
                  <Button key={k} type="button" variant="outline" size="sm" className={cn("tactile active:scale-95", preset === k && "border-primary text-primary")} onClick={() => { setPreset(k); setCloses(localDT(h)); haptic("select"); }}>{k}</Button>
                ))}
              </div>
              <Input type="datetime-local" value={closes} onChange={(e) => { setCloses(e.target.value); setPreset(""); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
