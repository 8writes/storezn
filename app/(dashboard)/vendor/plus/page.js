"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { Sparkles, CalendarClock } from "lucide-react";

const FEATURES = [
  { title: "Offline orders", text: "Record in-person, phone, and cash sales." },
  { title: "More staff", text: "Bring on more people to help run the store." },
  { title: "More storage", text: "Room for a bigger product catalog." },
];

// Team management, payouts, and this billing page are all owner-only
// concerns (see isStoreOwner in lib/auth.js and the NAV_BY_ROLE.staff
// entry in the dashboard layout, which leaves this page out entirely) -
// a staff member never sees or manages the store's subscription.
export default function VendorPlusPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();

  const [store, setStore] = useState(null);
  const [isPlus, setIsPlus] = useState(false);
  const [plusMonthlyPrice, setPlusMonthlyPrice] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setStore(data.store);
        setIsPlus(!!data.isPlus);
        setPlusMonthlyPrice(data.plusMonthlyPrice || 5000);
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/subscribe`, {
        method: "POST",
        body: JSON.stringify({ redirectUrl: window.location.href }),
      });
      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(err.message || "Failed to start subscription");
      setSubscribing(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/unsubscribe`, { method: "POST" });
      setStore(data.store);
      toast.success("Subscription cancelled - you'll keep Storezn+ until your current period ends");
    } catch (err) {
      toast.error(err.message || "Failed to cancel subscription");
    } finally {
      setCancelling(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">Storezn+</h1>

      {loading || !store ? (
        <FormSkeleton fields={3} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          {/* Branded header band - the one place this page gets to feel
              like a real upgrade, not just another settings form. */}
          <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-8 text-white relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "16px 16px" }}
            />
            <div className="relative flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15">
                  <Sparkles size={18} />
                </span>
                <div>
                  <p className="font-bold text-lg leading-tight">Storezn+</p>
                  <p className="text-sm text-brand-100">
                    {formatCurrency(plusMonthlyPrice)}
                    <span className="text-brand-200">/month</span>
                  </p>
                </div>
              </div>
              {isPlus && (
                <div className="flex items-center gap-2">
                  <Badge color={store.planCancelled ? "amber" : "green"}>
                    {store.planCancelled ? "Not renewing" : "Active"}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {isPlus ? (
              <>
                <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-sm p-4 text-sm text-slate-700">
                  <CalendarClock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <p>
                    {store.planCancelled
                      ? `Cancelled - you'll keep Storezn+ until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "your current period ends"}.`
                      : `Renews ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "monthly"} at ${formatCurrency(plusMonthlyPrice)}/month.`}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FEATURES.map(({ title }) => (
                    <div key={title} className="text-sm font-medium text-slate-700 bg-brand-50 border border-brand-100 rounded-sm px-3 py-2.5">
                      {title}
                    </div>
                  ))}
                </div>

                {!store.planCancelled && (
                  <Button type="button" variant="outline" fullWidth loading={cancelling} onClick={handleCancelSubscription}>
                    Cancel subscription
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FEATURES.map(({ title, text }) => (
                    <div key={title} className="bg-slate-50 border border-slate-200 rounded-sm p-4">
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{text}</p>
                    </div>
                  ))}
                </div>
                <Button type="button" loading={subscribing} onClick={handleSubscribe} fullWidth size="lg">
                  Upgrade to Storezn+
                </Button>
                <p className="text-xs text-slate-400 text-center">Cancel anytime.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
