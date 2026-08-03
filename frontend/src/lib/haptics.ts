// Haptic feedback.
//  - Android / Chrome: the Vibration API.
//  - iOS Safari (no Vibration API): the Taptic Engine via a hidden <input switch>
//    label click — this only fires inside a real user gesture, so call haptic()
//    synchronously from tap/click handlers (which we do for presses).
type Kind = "tap" | "select" | "success" | "warn" | "impact";

const PATTERNS: Record<Kind, number | number[]> = {
  select: 4,
  tap: 9,
  impact: 16,
  success: [10, 40, 22],
  warn: [28, 40, 28],
};

let iosLabel: HTMLLabelElement | null = null;
function getIosLabel(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (iosLabel) return iosLabel;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // Safari-only: a switch control fires the Taptic Engine on toggle
  label.appendChild(input);
  document.body.appendChild(label);
  iosLabel = label;
  return label;
}

export function haptic(kind: Kind = "tap") {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.vibrate(PATTERNS[kind])) {
      return;
    }
    // iOS fallback (must be within a user gesture to actually buzz).
    getIosLabel()?.click();
  } catch {
    /* ignore */
  }
}
