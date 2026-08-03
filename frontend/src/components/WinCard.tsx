import { PartyPopper, Share2 } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function WinCard({
  open,
  onOpenChange,
  amount,
  question,
  groupName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  amount: number;
  question: string;
  groupName?: string;
}) {
  const share = async () => {
    haptic("select");
    const text = `I won ${fmt(amount)} on "${question}" 🎉`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PoolBet", text });
        return;
      }
    } catch {
      /* user cancelled or share failed — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm overflow-hidden rounded-3xl border-emerald-400/30 bg-gradient-to-b from-emerald-500/10 via-background to-pink-500/10 text-center">
        {/* Soft radial glow behind the amount */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,hsl(var(--yes)/0.28),transparent_70%)]"
        />
        <div className="relative flex flex-col items-center gap-4 py-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-yes/15 text-yes shadow-glow-yes">
            <PartyPopper className="size-7" />
          </div>

          <DialogTitle className="bg-gradient-to-r from-emerald-400 to-pink-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            You won
          </DialogTitle>

          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-yes/70">+</span>
            <span className="font-mono text-5xl font-bold tabular-nums text-yes">{fmt(amount)}</span>
          </div>

          <p className="text-balance px-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{question}</span>
          </p>

          {groupName && (
            <span className="rounded-full bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-400">
              {groupName}
            </span>
          )}

          <div className="mt-2 flex w-full flex-col gap-2">
            <Button className="tactile h-11 w-full active:scale-95" onClick={share}>
              <Share2 className="size-4" /> Share
            </Button>
            <Button
              variant="ghost"
              className="h-10 w-full text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Nice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
