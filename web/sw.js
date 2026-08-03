// PoolBet service worker — app-shell precache + network-first.
const CACHE = "poolbet-v2";

const SHELL = [
  "/",
  "/static/app.js",
  "/static/styles.css",
  "/manifest.webmanifest",
  "/static/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isShellRequest(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  const p = url.pathname;
  return (
    p === "/" ||
    p.startsWith("/static/") ||
    p === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle the same-origin GET app shell; let the browser handle
  // everything else (API calls, other origins, non-GET) untouched so
  // API responses are never cached.
  if (!isShellRequest(request)) return;

  // Network-first: try the network, cache a fresh copy on success,
  // fall back to the cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// --- Web Push (appended; shell-cache logic above is untouched) ---
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "PoolBet", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PoolBet";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      data: data,
      icon: "/static/icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
