// Haptic feedback.
//  - Android / Chrome: the Vibration API (rich patterns).
//  - iOS Safari/PWA (no Vibration API): the Taptic Engine via a hidden
//    `<input switch>` toggled inside a real user gesture. This is an unofficial
//    Apple behaviour (iOS 17.4+) — it only fires synchronously within a tap, and
//    only when System Haptics is on, the device isn't in Low Power Mode, and the
//    hardware has a Taptic Engine (iPhone only — iPads have none). So call
//    haptic() synchronously from the gesture handler (which we do everywhere).
type Kind = "tap" | "select" | "success" | "warn" | "impact";

const VIBRATE: Record<Kind, number | number[]> = {
  select: 4,
  tap: 9,
  impact: 16,
  success: [10, 40, 22],
  warn: [28, 40, 28],
};

let iosInput: HTMLInputElement | null = null;
function getIosInput(): HTMLInputElement | null {
  if (typeof document === "undefined" || typeof document.body === "undefined") return null;
  if (iosInput?.isConnected) return iosInput;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  // Visually hidden but genuinely RENDERED — iOS won't buzz for display:none /
  // opacity:0 controls, so use the clip pattern instead of hiding it outright.
  label.style.cssText =
    "position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // Safari-only: a switch control fires the Taptic Engine on toggle
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosInput = input;
  return input;
}

export function haptic(kind: Kind = "tap") {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (navigator.vibrate(VIBRATE[kind])) return; // Android path
    }
    // iOS fallback: toggle the switch synchronously (must be inside a gesture).
    const el = getIosInput();
    if (el) {
      el.checked = !el.checked;
      el.click();
    }
  } catch {
    /* ignore */
  }
}
