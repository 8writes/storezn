// Browser-only push subscribe/unsubscribe, shared by PushNotificationToggle
// (Settings pages) and the vendor dashboard's setup guide step - both need
// the exact same subscribe flow, not two copies that could drift.

// Standard VAPID key conversion - PushManager.subscribe() needs the
// public key as a Uint8Array, not the base64url string it's stored/
// transmitted as everywhere else.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushUnavailableReason() {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return "Push notifications require a secure HTTPS connection.";
  if (!pushSupported()) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (ios && !window.matchMedia("(display-mode: standalone)").matches) {
      return "On iPhone or iPad, add Storezn to your Home Screen and open it from there to enable notifications.";
    }
    return "This browser does not support web push notifications. Try an up-to-date version of Chrome, Edge, Firefox, or Safari.";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "Push notifications are temporarily unavailable because the server key is not configured.";
  return null;
}

async function getServiceWorkerRegistration() {
  let registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) registration = await navigator.serviceWorker.register("/sw.js");
  return registration;
}

export async function getPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await getServiceWorkerRegistration();
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(token) {
  const unavailable = pushUnavailableReason();
  if (unavailable) throw new Error(unavailable);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked - allow them in your browser settings to enable this.");
  }
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  const res = await fetch("/api/v1/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to subscribe");
  return subscription;
}

export async function unsubscribeFromPush(token) {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await fetch("/api/v1/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
