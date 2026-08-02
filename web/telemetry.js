/*
 * telemetry.js — PoolBet client analytics
 * ----------------------------------------
 * Plain browser JS, no build step, no libraries. Loaded via <script> tag.
 * Attaches a global `window.Telemetry`.
 *
 * Transport: POST /events (same origin), JSON body { type: string, payload?: object }.
 * Auth: bearer token from localStorage("pb_token") -> header Authorization: "Bearer <token>".
 *       If no token is present, every send is silently skipped (nothing queued).
 * All network calls use fetch({ keepalive: true }) and swallow every error — telemetry
 * must never throw, never block, and never affect the app.
 *
 * Public API:
 *   Telemetry.track(type, payload)      -> POST /events with {type, payload}. Fire-and-forget.
 *   Telemetry.trackOnce(type, payload)  -> like track(), but dedupes a given `type` per page load.
 *   Telemetry.init()                    -> call ONCE on load. Emits "app_open" and wires up
 *                                          session-time tracking ("session_ping").
 *
 * Automatic event `type` strings emitted by init():
 *   "app_open"     — once, when init() runs.
 *   "session_ping" — on visibility hidden / pagehide / beforeunload, with { seconds }.
 *
 * app.js is expected to call Telemetry.init() once on load, and may call
 * Telemetry.track("bet_placed", {...}) and other custom events directly.
 */
(function () {
  "use strict";

  var ENDPOINT = "/events";

  // Read the bearer token; feature-detect localStorage so private-mode / SSR never throws.
  function getToken() {
    try {
      return window.localStorage && window.localStorage.getItem("pb_token");
    } catch (e) {
      return null;
    }
  }

  // Core send. No token -> skip. Offline -> skip. All errors swallowed.
  function track(type, payload) {
    try {
      var token = getToken();
      if (!token) return;                       // no auth: queue nothing, send nothing
      if (typeof fetch !== "function") return;  // feature-detect fetch
      if (navigator && navigator.onLine === false) return; // graceful no-op offline

      var body = { type: type };
      if (payload !== undefined) body.payload = payload;

      fetch(ENDPOINT, {
        method: "POST",
        keepalive: true, // survives page unload
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
      }).catch(function () { /* swallow network errors */ });
    } catch (e) {
      /* never throw */
    }
  }

  // Dedupe the same `type` within this page load.
  var seen = {};
  function trackOnce(type, payload) {
    if (seen[type]) return;
    seen[type] = true;
    track(type, payload);
  }

  // ---- Session-time tracking ----
  var startTs = null;         // when the current visible interval began (ms), or null if paused
  function accumulateSeconds() {
    if (startTs === null) return 0;
    var secs = Math.floor((Date.now() - startTs) / 1000);
    startTs = Date.now();     // reset the counter each flush
    return secs;
  }

  function flushSession() {
    var seconds = accumulateSeconds();
    if (seconds > 0) track("session_ping", { seconds: seconds });
  }

  var initialized = false;
  function init() {
    if (initialized) return;  // guard against double-init
    initialized = true;

    startTs = Date.now();

    track("app_open", {
      ts: Date.now(),
      ua: (navigator && navigator.userAgent) || "",
      standalone: !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    });

    try {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          flushSession();       // flush accumulated time when leaving
          startTs = null;       // pause timing while hidden
        } else if (document.visibilityState === "visible") {
          if (startTs === null) startTs = Date.now(); // resume timing
        }
      });
      // pagehide/beforeunload: final flush; keepalive lets it survive unload.
      window.addEventListener("pagehide", flushSession);
      window.addEventListener("beforeunload", flushSession);
    } catch (e) {
      /* feature-detect: ignore if listeners unsupported */
    }
  }

  window.Telemetry = { track: track, trackOnce: trackOnce, init: init };
})();
