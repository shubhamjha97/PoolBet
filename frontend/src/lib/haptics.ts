// Haptic feedback via the Vibration API. Graceful no-op where unsupported
// (notably iOS Safari, which does not expose navigator.vibrate).
type Kind = "tap" | "select" | "success" | "warn" | "impact";

const PATTERNS: Record<Kind, number | number[]> = {
  select: 4,
  tap: 9,
  impact: 16,
  success: [10, 40, 22],
  warn: [28, 40, 28],
};

export function haptic(kind: Kind = "tap") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    /* ignore */
  }
}
