import { useEffect, useRef } from "react";

/** Lightweight canvas backdrop: faint grid + two drifting neon glow orbs. */
export function AmbientNeonBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap for mobile GPUs
    let w = 0, h = 0, raf = 0, lastT = 0;

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const orb = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const grid = () => {
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    };

    const render = (t: number) => {
      if (t - lastT >= 33) { // throttle to ~30fps
        lastT = t;
        ctx.clearRect(0, 0, w, h);
        grid();
        const R = Math.max(w, h) * 0.5;
        orb(w * 0.25 + Math.sin(t / 4000) * w * 0.1, h * 0.2 + Math.cos(t / 5000) * h * 0.08, R, "rgba(34,197,94,0.12)");
        orb(w * 0.8 + Math.cos(t / 4500) * w * 0.1, h * 0.85 + Math.sin(t / 5200) * h * 0.08, R, "rgba(236,72,153,0.10)");
      }
      if (!reduce) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0 h-full w-full" aria-hidden />;
}
