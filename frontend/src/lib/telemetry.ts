// Lightweight, best-effort telemetry. Every network call swallows errors and
// uses keepalive so pings survive page unload. No-ops without a bearer token.
const TOKEN_KEY = "pb_token";

export function track(type: string, payload?: Record<string, unknown>): void {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    void fetch("/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify({ type, payload: payload ?? {} }),
      keepalive: true,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}

let started = false;

export function initTelemetry(): void {
  if (started) return;
  started = true;

  const standalone =
    typeof matchMedia !== "undefined" &&
    matchMedia("(display-mode: standalone)").matches;

  track("app_open", { ts: Date.now(), standalone });

  let sessionStart = Date.now();

  // Record time since the last flush, then reset the window so nothing is
  // double-counted across heartbeats, visibility changes, and unload.
  const flush = () => {
    const seconds = Math.round((Date.now() - sessionStart) / 1000);
    sessionStart = Date.now();
    if (seconds > 0) track("session_ping", { seconds });
  };

  // Heartbeat so long, actively-open sessions accrue time incrementally rather
  // than only when the tab is hidden or closed.
  const HEARTBEAT_MS = 60_000;
  setInterval(() => {
    if (document.visibilityState === "visible") flush();
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else sessionStart = Date.now(); // fresh window on return to foreground
  });

  window.addEventListener("pagehide", flush);
}
