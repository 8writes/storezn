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
import { Sparkles, CalendarClock, Receipt, Check, X } from "lucide-react";

const FEATURES = [
  { title: "Offline orders", text: "Record in-person, phone, and cash sales." },
  { title: "Custom domain", text: "Use your own domain instead of a storezn.com subdomain." },
  { title: "Multiple branches", text: "Track stock and staff separately across more than one location." },
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
  const [transactions, setTransactions] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

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

    apiFetch(`/api/v1/vendor/stores/${storeId}/plus-transactions`)
      .then((data) => setTransactions(data.transactions))
      .catch(() => setTransactions([]));
  }, [token, storeId, apiFetch]);

  const openConfirm = () => {
    setAgreed(false);
    setConfirmOpen(true);
  };

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
          {/* Branded header band - the price is the single biggest thing
              on it, deliberately, so there's no ambiguity about what
              you're agreeing to before you even reach the confirm step. */}
          <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-8 text-white relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "16px 16px" }}
            />
            <div className="relative flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-brand-100 text-sm font-medium">
                <Sparkles size={16} />
                Storezn+
              </div>
              {isPlus && (
                <Badge color={store.planCancelled ? "amber" : "green"}>
                  {store.planCancelled ? "Not renewing" : "Active"}
                </Badge>
              )}
            </div>
            <p className="relative mt-2 text-4xl font-extrabold tracking-tight">
              {formatCurrency(plusMonthlyPrice)}
              <span className="text-lg font-medium text-brand-200">/month</span>
            </p>
            <p className="relative mt-1 text-sm text-brand-100">Billed every month, cancel anytime.</p>
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

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What you get</p>
                  <ul className="space-y-2">
                    {FEATURES.map(({ title, text }) => (
                      <li key={title} className="flex items-start gap-2.5 text-sm">
                        <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium text-slate-900">{title}</span>{" "}
                          <span className="text-slate-500">- {text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {!store.planCancelled && (
                  <Button type="button" variant="outline" fullWidth loading={cancelling} onClick={handleCancelSubscription}>
                    Cancel subscription
                  </Button>
                )}
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What you get</p>
                  <ul className="space-y-2">
                    {FEATURES.map(({ title, text }) => (
                      <li key={title} className="flex items-start gap-2.5 text-sm">
                        <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium text-slate-900">{title}</span>{" "}
                          <span className="text-slate-500">- {text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button type="button" onClick={openConfirm} fullWidth size="lg">
                  Upgrade to Storezn+
                </Button>
                <p className="text-xs text-slate-400 text-center">
                  {formatCurrency(plusMonthlyPrice)}/month, billed automatically until you cancel.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {transactions && transactions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <p className="text-sm font-semibold text-slate-700 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Receipt size={16} className="text-slate-400" />
            Billing history
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="font-medium px-5 py-2.5">Date</th>
                <th className="font-medium px-5 py-2.5">Reference</th>
                <th className="font-medium px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 text-slate-700">{formatDate(t.paidAt)}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{t.paystackReference}</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-900">{formatCurrency(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm p-6 space-y-5 my-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm subscription</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(plusMonthlyPrice)}
                  <span className="text-sm font-medium text-slate-400">/month</span>
                </p>
              </div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-xs text-amber-800">
              This is a recurring monthly charge. {formatCurrency(plusMonthlyPrice)} will be deducted from your card
              automatically every month, starting today, until you cancel from this page.
            </div>

            <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span>
                I understand I&apos;ll be charged {formatCurrency(plusMonthlyPrice)} every month until I cancel my
                subscription.
              </span>
            </label>

            <Button type="button" fullWidth loading={subscribing} disabled={!agreed} onClick={handleSubscribe}>
              Continue to Paystack
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
