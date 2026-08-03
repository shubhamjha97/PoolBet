import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ShareSheet({
  open,
  onOpenChange,
  title,
  url,
  code,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  url: string;
  code?: string;
}) {
  const lockRef = useRef<any>(null);

  // Keep the screen awake + bright while a QR is shown (no web brightness API).
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

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(label);
    haptic("select");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl pb-safe">
        <SheetHeader>
          <SheetTitle className="text-center">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-2xl bg-white p-4 shadow-[0_0_44px_rgba(255,255,255,0.18)]">
            <QRCodeSVG value={url} size={224} level="M" marginSize={0} />
          </div>
          <p className="text-center text-xs text-muted-foreground">Scan to open · keep your screen bright</p>
          <div className="flex w-full flex-col gap-2">
            <Button className="tactile h-11 w-full active:scale-95" onClick={() => copy(url, "Link copied")}>
              <Link2 className="size-4" /> Copy link
            </Button>
            {code && (
              <Button variant="outline" className="tactile h-11 w-full font-mono tracking-widest active:scale-95" onClick={() => copy(code, "Code copied")}>
                <Copy className="size-4" /> {code}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
