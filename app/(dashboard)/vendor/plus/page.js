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
import { Sparkles, Check, ShoppingBag, Users, HardDrive } from "lucide-react";

const FEATURES = [
  { icon: ShoppingBag, text: "Record offline orders (in-person, phone, cash sales)" },
  { icon: Users, text: "More staff seats" },
  { icon: HardDrive, text: "More image storage" },
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
        <Sparkles size={20} className="text-brand-600" />
        Storezn+
      </h1>

      {loading || !store ? (
        <FormSkeleton fields={3} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-5">
          {isPlus ? (
            <>
              <div className="flex items-center gap-2">
                <Badge color="green">Active</Badge>
                {store.planCancelled && <Badge color="amber">Not renewing</Badge>}
              </div>
              <p className="text-sm text-slate-600">
                {store.planCancelled
                  ? `Cancelled - you'll keep Storezn+ until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "your current period ends"}.`
                  : `Renews ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "monthly"} at ${formatCurrency(plusMonthlyPrice)}/month.`}
              </p>
              {!store.planCancelled && (
                <Button type="button" variant="outline" loading={cancelling} onClick={handleCancelSubscription}>
                  Cancel subscription
                </Button>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-3xl font-extrabold text-slate-900">
                  {formatCurrency(plusMonthlyPrice)}
                  <span className="text-sm font-medium text-slate-400">/month</span>
                </p>
                <p className="text-sm text-slate-500 mt-1">Cancel anytime.</p>
              </div>
              <ul className="space-y-2.5">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
                    {text}
                  </li>
                ))}
              </ul>
              <Button type="button" loading={subscribing} onClick={handleSubscribe} fullWidth size="lg">
                Upgrade to Storezn+
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
