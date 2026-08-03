// "You won!" celebration: a short burst of confetti + a gentle win chime + a
// success haptic. Frontend-only, no dependencies — confetti is drawn on a
// self-cleaning full-screen <canvas>, the chime is synthesized with the Web
// Audio API. Safe to call multiple times; respects prefers-reduced-motion.
import { haptic } from "@/lib/haptics";

// PoolBet palette.
const COLORS = ["#34d399", "#f472b6"];
const DURATION_MS = 1500;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// A single confetti piece.
interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
}

/**
 * Mount (or reuse) a full-screen, non-interactive canvas overlay used for the
 * confetti burst. Exported for callers that want to pre-warm the container, but
 * `celebrateWin` manages one internally, so most callers never need this.
 */
export function mountCelebrationRoot(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById("poolbet-celebrate") as HTMLCanvasElement | null;
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.id = "poolbet-celebrate";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(canvas);
  return canvas;
}

function runConfetti() {
  const canvas = mountCelebrationRoot();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.scale(dpr, dpr);

  // Launch two fountains from the lower corners toward the center-top.
  const pieces: Piece[] = [];
  const N = 140;
  for (let i = 0; i < N; i++) {
    const fromLeft = i % 2 === 0;
    const originX = fromLeft ? W * 0.12 : W * 0.88;
    const angle = (fromLeft ? -1 : 1) * (Math.PI / 4) - Math.PI / 2; // up-and-inward
    const spread = (Math.random() - 0.5) * 0.9;
    const speed = 7 + Math.random() * 7;
    pieces.push({
      x: originX,
      y: H * 0.9,
      vx: Math.cos(angle + spread) * speed,
      vy: Math.sin(angle + spread) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: 5 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
    });
  }

  const gravity = 0.18;
  const drag = 0.99;
  const start = performance.now();

  function frame(now: number) {
    const elapsed = now - start;
    const c = ctx as CanvasRenderingContext2D;
    c.clearRect(0, 0, W, H);
    // Fade out over the final third of the run.
    const fade = elapsed > DURATION_MS * 0.66 ? Math.max(0, 1 - (elapsed - DURATION_MS * 0.66) / (DURATION_MS * 0.34)) : 1;
    c.globalAlpha = fade;

    for (const p of pieces) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      c.restore();
    }

    if (elapsed < DURATION_MS) {
      requestAnimationFrame(frame);
    } else {
      canvas?.remove();
    }
  }

  requestAnimationFrame(frame);
}

// Lazily-created shared AudioContext so repeated wins don't spawn many contexts.
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    // A gentle rising two-note arpeggio (E5 -> B5).
    const notes = [659.25, 987.77];
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      // Soft attack, gentle decay.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    /* audio blocked / unsupported — no-op */
  }
}

/**
 * Fire the full win celebration: confetti (skipped under reduced-motion), a
 * short pleasant chime, and a success haptic. Safe to call repeatedly.
 */
export function celebrateWin(_opts: { amount: number; question: string }) {
  haptic("success");
  playChime();
  if (!prefersReducedMotion()) runConfetti();
}
