import { useEffect, useState, type ReactNode } from "react";
import { Download, Share, SquarePlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { haptic } from "@/lib/haptics";

/* eslint-disable @typescript-eslint/no-explicit-any */
let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  deferredPrompt = e;
  window.dispatchEvent(new Event("pb-installable"));
});

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
        {n}
      </div>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
        {icon}
      </div>
      <p className="text-sm">{children}</p>
    </div>
  );
}

export function InstallButton() {
  const [visible, setVisible] = useState(!isStandalone());
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const on = () => setVisible(!isStandalone());
    const installed = () => setVisible(false);
    window.addEventListener("pb-installable", on);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("pb-installable", on);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!visible) return null;

  const click = async () => {
    haptic("tap");
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === "accepted") setVisible(false);
      return;
    }
    setShowIos(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="tap-target tactile border-primary/40 text-primary"
        onClick={click}
        aria-label="Install app"
      >
        <Download className="size-5" />
      </Button>

      <Dialog open={showIos} onOpenChange={setShowIos}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install PoolBet</DialogTitle>
          </DialogHeader>
          <p className="mb-3 text-sm text-muted-foreground">
            Add it to your home screen for a full-screen, app-like experience.
          </p>
          <div className="space-y-4">
            <Step n={1} icon={<Share className="size-4" />}>
              Tap the <b>Share</b> button in Safari's toolbar.
            </Step>
            <Step n={2} icon={<SquarePlus className="size-4" />}>
              Choose <b>Add to Home Screen</b>.
            </Step>
            <Step n={3} icon={<Check className="size-4" />}>
              Tap <b>Add</b> — PoolBet lands on your home screen.
            </Step>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            On iPhone/iPad use <b>Safari</b>. On Android/desktop Chrome the button installs it directly.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
