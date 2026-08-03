// Web Push subscription helper. Everything is feature-detected so this is a
// safe no-op / clear error on browsers that lack the relevant APIs (notably
// older iOS Safari, non-standalone contexts, etc.).
import { api } from "@/lib/api";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

// Convert a base64url-encoded VAPID public key into the Uint8Array the
// PushManager expects for applicationServerKey.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function enablePush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("Notifications aren't supported here");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications permission was not granted");
  }

  const reg = await navigator.serviceWorker.ready;

  const { public_key } = await api<{ public_key: string }>("GET", "/push/public-key");
  // Cast to BufferSource — TS widens Uint8Array's buffer to include SharedArrayBuffer.
  const applicationServerKey = urlBase64ToUint8Array(public_key) as BufferSource;

  // Reuse an existing subscription when present; otherwise create one.
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  await api("POST", "/push/subscribe", sub.toJSON());
}
