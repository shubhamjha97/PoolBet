// Ambient backdrop, GPU-only: a static CSS grid + two radial-gradient orbs that
// drift via `transform: translate3d` (composited, ~0 CPU → smooth 60fps even on
// iPhone). No canvas / requestAnimationFrame. Respects reduced-motion via CSS.
export function AmbientNeonBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
          WebkitMaskImage: "radial-gradient(120% 70% at 50% 0%, #000 0%, transparent 75%)",
          maskImage: "radial-gradient(120% 70% at 50% 0%, #000 0%, transparent 75%)",
        }}
      />
      <div
        className="absolute -left-[10vmax] -top-[15vmax] size-[55vmax] rounded-full will-change-transform"
        style={{ background: "radial-gradient(circle, rgba(34,197,94,0.14), transparent 60%)", animation: "orb-a 16s ease-in-out infinite" }}
      />
      <div
        className="absolute -bottom-[18vmax] -right-[12vmax] size-[55vmax] rounded-full will-change-transform"
        style={{ background: "radial-gradient(circle, rgba(236,72,153,0.12), transparent 60%)", animation: "orb-b 20s ease-in-out infinite" }}
      />
    </div>
  );
}
