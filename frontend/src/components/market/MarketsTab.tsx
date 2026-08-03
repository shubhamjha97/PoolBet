import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Group, Market } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { MarketCard } from "./MarketCard";
import { Plus as PlusIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const PRESETS: [string, number][] = [["1h", 1], ["6h", 6], ["1d", 24], ["3d", 72], ["7d", 168]];

// One-tap starters. `members: true` fills outcomes with the group's member names.
const TEMPLATES: { label: string; question: string; outcomes?: string[]; members?: boolean }[] = [
  { label: "Who pays? 🍽️", question: "Who's paying for this one?", members: true },
  { label: "Leave time 🕐", question: "What time do we actually leave?", outcomes: ["Before 8am", "8–10am", "10am–12pm", "After 12pm"] },
  { label: "Who's late? ⏰", question: "Who shows up last?", members: true },
  { label: "Will it rain? 🌧️", question: "Will it rain today?" },
  { label: "Over/under 📊", question: "Over/under — will we go over?" },
];
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
  const [multi, setMulti] = useState(false);
  const [outcomes, setOutcomes] = useState<string[]>(["", ""]);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    haptic("select");
    setQuestion(t.question);
    const memberNames = group.members.map((m) => m.name).slice(0, 8);
    if (t.members && memberNames.length >= 2) {
      setMulti(true); setOutcomes(memberNames);
    } else if (t.outcomes) {
      setMulti(true); setOutcomes(t.outcomes);
    } else {
      setMulti(false); setOutcomes(["", ""]);
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return markets;
    return markets.filter((m) => m.question.toLowerCase().includes(s) || m.bets.some((b) => b.member_name.toLowerCase().includes(s)));
  }, [markets, q]);

  async function create() {
    if (question.trim().length < 3) return toast.error("Give the market a question");
    setBusy(true);
    haptic("tap");
    const labels = outcomes.map((s) => s.trim()).filter(Boolean);
    if (multi && new Set(labels).size < 2) { setBusy(false); return toast.error("Add at least 2 distinct outcomes"); }
    try {
      await api("POST", `/groups/${group.id}/markets`, {
        question: question.trim(),
        rules: rules.trim() || null,
        closes_at: new Date(closes).toISOString(),
        outcomes: multi ? labels : null,
      });
      haptic("success");
      setNewOpen(false); setQuestion(""); setRules(""); setMulti(false); setOutcomes(["", ""]);
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
              <Label>Quick start</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                    className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary active:scale-95">
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{multi ? "Question" : "Question (YES / NO)"}</Label>
              <Input placeholder={multi ? "Who drives the first leg?" : "Will the Chiefs cover the spread?"} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={280} />
            </div>

            <label className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm"><span className="font-medium">Multiple choice</span><span className="ml-2 text-xs text-muted-foreground">pick from named outcomes</span></span>
              <Switch checked={multi} onCheckedChange={(v) => { setMulti(v); haptic("select"); }} />
            </label>

            {multi && (
              <div className="space-y-2">
                <Label>Outcomes</Label>
                {outcomes.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder={`Outcome ${i + 1}`} value={o} maxLength={60}
                      onChange={(e) => setOutcomes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} />
                    {outcomes.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" className="tap-target shrink-0"
                        onClick={() => { setOutcomes((prev) => prev.filter((_, j) => j !== i)); haptic("tap"); }}><X className="size-4" /></Button>
                    )}
                  </div>
                ))}
                {outcomes.length < 8 && (
                  <Button type="button" variant="outline" size="sm" className="tactile active:scale-95"
                    onClick={() => { setOutcomes((prev) => [...prev, ""]); haptic("select"); }}><PlusIcon className="size-3.5" /> Add outcome</Button>
                )}
              </div>
            )}

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
