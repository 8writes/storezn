"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";

// Standard VAPID key conversion - PushManager.subscribe() needs the
// public key as a Uint8Array, not the base64url string it's stored/
// transmitted as everywhere else.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Self-contained enable/disable control for browser push - reads its own
// current subscription state from the service worker rather than
// needing the parent page to track it. Renders nothing if the browser
// doesn't support push at all (older Safari, some in-app browsers)
// rather than showing a control that would just fail.
export function PushNotificationToggle({ token }) {
  const [supported, setSupported] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked - allow them in your browser settings to enable this.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
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
      setSubscribed(true);
      toast.success("Notifications enabled");
    } catch (err) {
      toast.error(err.message || "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/v1/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notifications turned off");
    } catch (err) {
      toast.error(err.message || "Could not turn off notifications");
    } finally {
      setBusy(false);
    }
  };

  if (supported === false || supported === null) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {subscribed ? (
          <Bell size={18} className="text-brand-600 shrink-0" />
        ) : (
          <BellOff size={18} className="text-slate-700 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">Push notifications</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {subscribed
              ? "You'll get notified on this device for new orders, low stock, and updates."
              : "Get notified on this device for new orders, low stock, and updates."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        className={`shrink-0 px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          subscribed ? "border border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {subscribed ? "Turn off" : "Enable"}
      </button>
    </div>
  );
}
