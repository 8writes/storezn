"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { pushSupported, pushUnavailableReason, getPushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/pushClient.js";

// Self-contained enable/disable control for browser push - reads its own
// current subscription state from the service worker rather than
// needing the parent page to track it. Renders nothing if the browser
// doesn't support push at all (older Safari, some in-app browsers)
// rather than showing a control that would just fail.
export function PushNotificationToggle({ token }) {
  const [supported, setSupported] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [permission, setPermission] = useState("default");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      const reason = pushUnavailableReason();
      if (!active) return;
      if (reason || !pushSupported()) {
        setUnavailableReason(reason || "Push notifications are not supported by this browser.");
        setSupported(false);
        return;
      }
      setSupported(true);
      setPermission(Notification.permission);
      const sub = await getPushSubscription().catch(() => null);
      if (active) setSubscribed(!!sub);
    });
    return () => { active = false; };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush(token);
      setSubscribed(true);
      setPermission("granted");
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
      await unsubscribeFromPush(token);
      setSubscribed(false);
      toast.success("Notifications turned off");
    } catch (err) {
      toast.error(err.message || "Could not turn off notifications");
    } finally {
      setBusy(false);
    }
  };

  if (supported === null) {
    return <div className="bg-surface border border-slate-200 rounded-sm p-5 h-20 animate-pulse" aria-label="Checking notification support" />;
  }

  return (
    <div className="bg-surface border border-slate-200 rounded-sm p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {subscribed ? (
          <Bell size={18} className="text-brand-600 shrink-0" />
        ) : (
          <BellOff size={18} className="text-slate-700 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">Push notifications</p>
          <p className="text-xs text-slate-800 mt-0.5">
            {supported === false
              ? unavailableReason
              : permission === "denied"
                ? "Notifications are blocked for Storezn. Allow them in this browser's site settings, then reload the page."
                : subscribed
              ? "You'll get notified on this device for new orders, low stock, and updates."
              : "Get notified on this device for new orders, low stock, and updates."}
          </p>
        </div>
      </div>
      {supported && (
        <button
          type="button"
          onClick={subscribed ? disable : enable}
          disabled={busy || permission === "denied" || !token}
          className={`shrink-0 px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            subscribed ? "border border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-brand-600 text-white hover:bg-brand-700"
          }`}
        >
          {permission === "denied" ? "Blocked" : subscribed ? "Turn off" : "Enable"}
        </button>
      )}
    </div>
  );
}
