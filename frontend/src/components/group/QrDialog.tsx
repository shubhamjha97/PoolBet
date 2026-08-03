import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function QrDialog({
  open,
  onOpenChange,
  url,
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
  label: string;
}) {
  const lockRef = useRef<any>(null);

  // Keep the screen awake + at full brightness while the code is shown. (The web
  // has no brightness API; the Wake Lock + a bright white panel is the best we can do.)
  useEffect(() => {
    async function acquire() {
      try {
        if ("wakeLock" in navigator) lockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    }
    if (open) acquire();
    return () => {
      try {
        lockRef.current?.release?.();
      } catch {
        /* ignore */
      }
      lockRef.current = null;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Scan to join {label}</DialogTitle>
        </DialogHeader>
        <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-[0_0_40px_rgba(255,255,255,0.15)]">
          <QRCodeSVG value={url} size={220} level="M" marginSize={0} />
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Point a camera at the code to open the group.
        </p>
      </DialogContent>
    </Dialog>
  );
}
