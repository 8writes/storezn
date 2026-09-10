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
import { Sparkles, Building2, CalendarClock, Receipt, Check } from "lucide-react";

const SUPPORT_EMAIL = "support@ozmictech.com";

// Storezn+ is the self-serve tier (Paystack checkout on this page).
const PLUS_FEATURES = [
  {
    title: "Your own web address",
    text: "Run the store on a domain you own (yourstore.com) instead of a storezn.com subdomain. We provision and renew the SSL certificate for you — you point your DNS once and it stays working.",
  },
  {
    title: "More than one branch",
    text: "Open extra locations and keep each branch's stock, staff and sales separate. Assign a staff member to a single branch, move stock between branches, and see per-branch numbers in every report.",
  },
  {
    title: "A bigger team",
    text: "Add more staff logins beyond the free limit, each with their own password and only the access they need — a cashier sees their till, a manager sees the store.",
  },
  {
    title: "More media storage",
    text: "A larger allowance for product photos and store images, so a big catalogue with several pictures per item doesn't run out of room.",
  },
  {
    title: "Storefront theme colour",
    text: "Set your brand's accent colour across the storefront — buttons, links and highlights all pick it up.",
  },
];

// Storezn Enterprise is a superset of Plus. It's only ever switched on by
// the Storezn team (an off-platform arrangement, see the super-admin
// store page) — there is no self-checkout for it on this page.
const ENTERPRISE_FEATURES = [
  {
    title: "In-person registers (POS)",
    text: "Open a till on any phone, tablet or computer. Ring walk-in customers up item by item, scan or search your catalogue, take cash, transfer or POS-machine payments, give change from the drawer, and print or text a receipt.",
  },
  {
    title: "Shifts & Z-reports",
    text: "Every cashier opens their own shift with a counted opening float and closes it with a counted drawer. The Z-report shows expected vs counted cash for every payment type and exactly what is over or short.",
  },
  {
    title: "Keeps working offline",
    text: "When the internet drops, selling carries on. Sales, stock counts and price changes are saved on the device and sync automatically the moment the connection is back — nothing is lost.",
  },
  {
    title: "Record past & phone sales",
    text: "Log a sale that happened away from the storefront — a phone order, a WhatsApp order, a cash sale — so it lands in your order history and pulls stock down like any other order.",
  },
  {
    title: "Cash-drawer movements",
    text: "Track money paid into or taken out of the drawer during a shift (a supplier paid in cash, the owner lifts a float) with a reason recorded on every entry.",
  },
  {
    title: "Payment-account tracking",
    text: "Record which POS machine or transfer account each payment landed in — Moniepoint, Opay, and so on — and trace every naira of change back to where it was given from.",
  },
  {
    title: "Month-end forensic report",
    text: "A full audit document for the month: sales against cash counted, every discount, price override, refund and drawer shortage, plus a per-staff breakdown of who did what and where money left as something other than a sale.",
  },
];

function FeatureList({ features }) {
  return (
    <ul className="space-y-2.5">
      {features.map(({ title, text }) => (
        <li key={title} className="flex items-start gap-2.5 text-sm">
          <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
          <span>
            <span className="font-medium text-slate-900">{title}</span>
            <span className="text-slate-500"> &mdash; {text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
  const [isEnterprise, setIsEnterprise] = useState(false);
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
        setIsEnterprise(!!data.isEnterprise);
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

  // Enterprise is a superset of Plus - an Enterprise store already has
  // every Plus feature, so the self-serve Plus checkout is hidden for it.
  const plusActive = isPlus && !isEnterprise;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">Plans</h1>

      {loading || !store ? (
        <FormSkeleton fields={3} />
      ) : (
        <>
          {/* -------- Storezn+ -------- */}
          <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
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
                {isEnterprise ? (
                  <Badge color="blue">Included with Enterprise</Badge>
                ) : isPlus ? (
                  <Badge color={store.planCancelled ? "amber" : "green"}>
                    {store.planCancelled ? "Not renewing" : "Active"}
                  </Badge>
                ) : null}
              </div>
              <p className="relative mt-2 text-4xl font-extrabold tracking-tight">
                {formatCurrency(plusMonthlyPrice)}
                <span className="text-lg font-medium text-brand-200">/month</span>
              </p>
              <p className="relative mt-1 text-sm text-brand-100">Billed every month, cancel anytime.</p>
            </div>

            <div className="p-6 space-y-6">
              {isPlus && (
                <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-sm p-4 text-sm text-slate-700">
                  <CalendarClock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <p>
                    {isEnterprise
                      ? "Your store is on Storezn Enterprise, which already includes everything in Storezn+."
                      : store.planCancelled
                        ? `Cancelled - you'll keep Storezn+ until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "your current period ends"}.`
                        : `Renews ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "monthly"} at ${formatCurrency(plusMonthlyPrice)}/month.`}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What you get</p>
                <FeatureList features={PLUS_FEATURES} />
              </div>

              {plusActive && !store.planCancelled && (
                <Button type="button" variant="outline" fullWidth loading={cancelling} onClick={handleCancelSubscription}>
                  Cancel subscription
                </Button>
              )}
              {!isPlus && (
                <>
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

          {/* -------- Storezn Enterprise -------- */}
          <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
            <div className="bg-gradient-to-br from-neutral-800 to-neutral-950 px-6 py-8 text-white relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-20"
                style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "16px 16px" }}
              />
              <div className="relative flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
                  <Building2 size={16} />
                  Storezn Enterprise
                </div>
                {isEnterprise && (
                  <Badge color={store.planCancelled ? "amber" : "green"}>
                    {store.planCancelled ? "Not renewing" : "Active"}
                  </Badge>
                )}
              </div>
              <p className="relative mt-2 text-2xl font-extrabold tracking-tight">
                Everything in Storezn+, plus a full point-of-sale system
              </p>
              <p className="relative mt-1 text-sm text-slate-300">
                Set up with you by the Storezn team. Pricing depends on your branches and tills.
              </p>
            </div>

            <div className="p-6 space-y-6">
              {isEnterprise && (
                <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-sm p-4 text-sm text-slate-700">
                  <CalendarClock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <p>
                    {store.planCancelled
                      ? `Your Enterprise term runs until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "the end of the paid period"}. Talk to us before then to keep it going.`
                      : `Active${store.planRenewsAt ? ` until ${formatDate(store.planRenewsAt)}` : ""}. Renewals are arranged with the Storezn team.`}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {isEnterprise ? "What's included" : "What you get on top of Storezn+"}
                </p>
                <FeatureList features={ENTERPRISE_FEATURES} />
              </div>

              {!isEnterprise && (
                <div className="space-y-2">
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Storezn Enterprise enquiry")}`} className="block">
                    <Button type="button" fullWidth size="lg">
                      Contact us about Enterprise
                    </Button>
                  </a>
                  <p className="text-xs text-slate-400 text-center">
                    Email {SUPPORT_EMAIL} and we&apos;ll set it up on your store.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {transactions && transactions.length > 0 && (
        <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
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
          <div className="relative bg-surface rounded-sm shadow-xl w-full max-w-sm p-6 space-y-5 my-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm subscription</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(plusMonthlyPrice)}
                  <span className="text-sm font-medium text-slate-400">/month</span>
                </p>
              </div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                &times;
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
