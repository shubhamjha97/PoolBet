import { useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const THUMB = 44; // px
const PAD = 4;

/**
 * Kalshi-style "slide to confirm" — drag the thumb to the end to fire onConfirm.
 * Releases before the end snap back. Ticks haptically as it slides; a success
 * buzz fires on commit.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  colorClass = "bg-primary text-primary-foreground",
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  colorClass?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const lastTick = useRef(0);
  const fireBurst = () => setBurstKey((k) => k + 1);

  const maxX = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(0, w - THUMB - PAD * 2);
  };

  const move = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const nx = Math.min(maxX(), Math.max(0, clientX - rect.left - THUMB / 2));
    setX(nx);
    const step = Math.floor((nx / (maxX() || 1)) * 8);
    if (step !== lastTick.current) {
      lastTick.current = step;
      haptic("select");
    }
  };

  const release = () => {
    setDragging(false);
    if (x >= maxX() * 0.9 && !done) {
      setX(maxX());
      setDone(true);
      fireBurst();
      haptic("success");
      onConfirm();
      // reset shortly after so the control can be reused
      setTimeout(() => { setDone(false); setX(0); lastTick.current = 0; }, 900);
    } else {
      setX(0);
      lastTick.current = 0;
    }
  };

  const progress = maxX() ? x / maxX() : 0;

  return (
    <div className="relative">
      {burstKey > 0 && (
        <span key={burstKey} className="pointer-events-none absolute inset-0 rounded-full [animation:pb-burst_420ms_ease-out_forwards]" />
      )}
      <div
        ref={trackRef}
        className={cn(
          "relative h-[52px] w-full select-none overflow-hidden rounded-full border bg-secondary",
          disabled && "pointer-events-none opacity-50",
        )}
      >
      {/* colored fill trailing the thumb — brightens + glows as it sweeps across */}
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full brightness-110", colorClass)}
        style={{
          width: x + THUMB + PAD,
          boxShadow: progress > 0.05 ? `0 0 18px -2px hsl(var(--primary) / ${0.25 + progress * 0.4})` : "none",
          transition: dragging ? "none" : "width 220ms ease, box-shadow 220ms ease",
        }}
      />
      {/* label */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted-foreground"
        style={{ opacity: 1 - progress * 1.4 }}
      >
        {label}
      </div>
      {/* thumb */}
      <div
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full shadow-md",
          colorClass,
          "touch-none",
        )}
        style={{ left: PAD + x, transition: dragging ? "none" : "left 220ms ease" }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          haptic("tap");
        }}
        onPointerMove={(e) => { if (dragging) move(e.clientX); }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setDone(true); fireBurst(); haptic("success"); onConfirm(); setTimeout(() => setDone(false), 900); } }}
      >
        {done ? <Check className="size-5" /> : <ArrowRight className="size-5" />}
      </div>
      </div>
    </div>
  );
}
