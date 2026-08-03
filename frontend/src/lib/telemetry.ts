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
  let flushed = false;

  const flush = () => {
    const seconds = Math.round((Date.now() - sessionStart) / 1000);
    if (seconds <= 0) return;
    track("session_ping", { seconds });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
      flushed = true;
    } else {
      // Returning to foreground: start a fresh session window.
      sessionStart = Date.now();
      flushed = false;
    }
  });

  window.addEventListener("pagehide", () => {
    if (!flushed) flush();
  });
}
