// PoolBet Web Push subscription flow.
//
// Plain browser JS, no build step, no libraries. Loaded via <script> and
// attaches a `Push` object to `window`. Talks to the PoolBet backend on the
// SAME ORIGIN using a bearer token from localStorage("pb_token").
//
// Backend contract:
//   GET  /push/public-key   -> { public_key: "<VAPID public key, base64url>" }
//   POST /push/subscribe    (auth) body = PushSubscription.toJSON()
//                                  ({ endpoint, keys: { p256dh, auth } }) -> { ok: true }
//   POST /push/unsubscribe  (auth) body = { endpoint } -> { ok: true }
//
// window.Push API:
//   Push.isSupported()  -> boolean   (serviceWorker + PushManager + Notification)
//   Push.permission()   -> string    (current Notification.permission, or "unsupported")
//   Push.isSubscribed() -> Promise<boolean>
//   Push.enable()       -> Promise<{ ok: true } | { ok: false, reason }>
//         Requests notification permission, ensures the SW is ready, fetches the
//         VAPID public key, subscribes via pushManager (reusing an existing
//         subscription if present), and POSTs the subscription JSON to the backend.
//   Push.disable()      -> Promise<{ ok: true } | { ok: false, reason }>
//         Unsubscribes locally and POSTs /push/unsubscribe.
//
// app.js will add an "Enable notifications" button that calls Push.enable().
//
// NOTE: iOS only supports web push for an INSTALLED PWA (added to the Home
// Screen) on iOS 16.4+. In a plain Safari tab on iOS, isSupported() is false.
(function () {
  "use strict";

  var TOKEN_KEY = "pb_token";

  function isSupported() {
    return (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  function permission() {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  }

  function getToken() {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  // Standard helper: convert a base64url VAPID key into the Uint8Array that
  // pushManager.subscribe expects as applicationServerKey.
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function authHeaders(token) {
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    };
  }

  function isSubscribed() {
    if (!isSupported()) return Promise.resolve(false);
    return navigator.serviceWorker.ready
      .then(function (reg) {
        return reg.pushManager.getSubscription();
      })
      .then(function (sub) {
        return !!sub;
      })
      .catch(function () {
        return false;
      });
  }

  function fetchPublicKey() {
    return fetch("/push/public-key", {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("public-key HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.public_key) throw new Error("missing public_key");
        return data.public_key;
      });
  }

  function enable() {
    if (!isSupported()) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }

    var token = getToken();
    if (!token) {
      return Promise.reject(
        new Error("Not signed in: no pb_token in localStorage")
      );
    }

    return Promise.resolve()
      .then(function () {
        return Notification.requestPermission();
      })
      .then(function (result) {
        if (result !== "granted") {
          return { ok: false, reason: "denied" };
        }

        return navigator.serviceWorker.ready
          .then(function (reg) {
            return reg.pushManager.getSubscription().then(function (existing) {
              if (existing) return existing;
              return fetchPublicKey().then(function (publicKey) {
                return reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey),
                });
              });
            });
          })
          .then(function (subscription) {
            return fetch("/push/subscribe", {
              method: "POST",
              headers: authHeaders(token),
              body: JSON.stringify(subscription.toJSON()),
            }).then(function (res) {
              if (!res.ok) throw new Error("subscribe HTTP " + res.status);
              return { ok: true };
            });
          });
      })
      .catch(function (err) {
        return { ok: false, reason: (err && err.message) || "error" };
      });
  }

  function disable() {
    if (!isSupported()) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }

    var token = getToken();

    return navigator.serviceWorker.ready
      .then(function (reg) {
        return reg.pushManager.getSubscription();
      })
      .then(function (subscription) {
        if (!subscription) return { ok: true };

        var endpoint = subscription.endpoint;

        return subscription
          .unsubscribe()
          .catch(function () {
            return false;
          })
          .then(function () {
            if (!token) return { ok: true };
            return fetch("/push/unsubscribe", {
              method: "POST",
              headers: authHeaders(token),
              body: JSON.stringify({ endpoint: endpoint }),
            })
              .then(function (res) {
                if (!res.ok) throw new Error("unsubscribe HTTP " + res.status);
                return { ok: true };
              })
              .catch(function (err) {
                return { ok: false, reason: (err && err.message) || "error" };
              });
          });
      })
      .catch(function (err) {
        return { ok: false, reason: (err && err.message) || "error" };
      });
  }

  window.Push = {
    isSupported: isSupported,
    permission: permission,
    isSubscribed: isSubscribed,
    enable: enable,
    disable: disable,
    urlBase64ToUint8Array: urlBase64ToUint8Array,
  };
})();
