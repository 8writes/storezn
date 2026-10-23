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
    title: "Unlimited products",
    text: "Grow past the free plan's 50-product limit and keep adding your full catalogue.",
  },
  {
    title: "Your own web address",
    text: "Run the store on a domain you own (yourstore.com) instead of a storezn.com subdomain. We provision and renew the SSL certificate for you. You point your DNS once and it stays working.",
  },
  {
    title: "More than one branch",
    text: "Open extra locations and keep each branch's stock, staff and sales separate. Assign a staff member to a single branch, move stock between branches, and see per-branch numbers in every report.",
  },
  {
    title: "A bigger team",
    text: "Add more staff logins beyond the free limit, each with their own password and only the access they need: a cashier sees their till, a manager sees the store.",
  },
  {
    title: "More media storage",
    text: "A larger allowance for product photos and store images, so a big catalogue with several pictures per item doesn't run out of room.",
  },
  {
    title: "Your brand colour and font",
    text: "Pick your shop's colour and font. Your storefront and invoices all use them.",
  },
  {
    title: "No Storezn branding",
    text: "The \"Get your own website\" link disappears from your shop footer.",
  },
  {
    title: "Record sales you make yourself",
    text: "Log in-person, phone and WhatsApp sales so stock and takings stay in one place.",
  },
];

// Storezn Enterprise is a superset of Plus. It's only ever switched on by
// the Storezn team (an off-platform arrangement, see the super-admin
// store page). There is no self-checkout for it on this page.
const ENTERPRISE_FEATURES = [
  { title: "Shop till (POS)", text: "Sell at the counter on any phone, tablet or computer - cash, transfer or POS machine." },
  { title: "Cashier shifts", text: "Each cashier opens and closes with a cash count, so you see what's over or short." },
  { title: "Works offline", text: "Keeps selling when the internet drops and syncs when it's back." },
  { title: "Cash drawer & payment accounts", text: "Track money in and out of the drawer, and which account (Moniepoint, Opay) each payment went to." },
  { title: "Month-end report", text: "What sold, who sold it, and where every naira went." },
];

function FeatureList({ features }) {
  return (
    <ul className="space-y-2.5">
      {features.map(({ title, text }) => (
        <li key={title} className="flex items-start gap-2.5 text-sm">
          <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
          <span>
            <span className="block font-medium text-slate-900">{title}</span>
            <span className="block text-slate-600">{text}</span>
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
  const [plusStandardMonthlyPrice, setPlusStandardMonthlyPrice] = useState(5000);
  const [discountPercent, setDiscountPercent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [transactions, setTransactions] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setStore(data.store);
        setIsPlus(!!data.isPlus);
        setIsEnterprise(!!data.isEnterprise);
        setPlusMonthlyPrice(data.plusMonthlyPrice || 5000);
        setPlusStandardMonthlyPrice(data.plusStandardMonthlyPrice || 5000);
        setDiscountPercent(data.subscriptionDiscountPercent ?? null);
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

  const currentPlan = isEnterprise ? "Enterprise" : isPlus ? "Storezn+" : "Free";
  const perDay = Math.round(plusStandardMonthlyPrice / 30);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Plans</h1>
        <p className="mt-1 text-sm text-slate-700">
          You&apos;re on <strong className="text-slate-900">{currentPlan}</strong>.
        </p>
      </div>

      {loading || !store ? (
        <FormSkeleton fields={3} />
      ) : (
        <>
          {/* -------- Storezn+ -------- */}
          <div className={`bg-surface rounded-sm overflow-hidden ${plusActive ? "border border-slate-200" : "border-2 border-brand-500 shadow-lg shadow-brand-900/5"}`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  <Sparkles size={16} /> Storezn+
                </p>
                {isEnterprise ? (
                  <Badge color="blue">Included with Enterprise</Badge>
                ) : isPlus ? (
                  <Badge color={store.planCancelled ? "amber" : "green"}>{store.planCancelled ? "Not renewing" : "Active"}</Badge>
                ) : (
                  <Badge color="green">Recommended</Badge>
                )}
              </div>

              {!isPlus && (
                <>
                  <p className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Look like a big brand</p>
                  <p className="mt-1 text-sm text-slate-700">Your own domain, colours and font - and no limits on your products.</p>
                  <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
                    <p className="text-4xl font-extrabold tracking-tight text-slate-900">{formatCurrency(plusMonthlyPrice)}</p>
                    {discountPercent != null ? (
                      <p className="pb-1 text-sm text-slate-600">
                        first month <span className="line-through">{formatCurrency(plusStandardMonthlyPrice)}</span>, then {formatCurrency(plusStandardMonthlyPrice)}/month
                      </p>
                    ) : (
                      <p className="pb-1 text-sm text-slate-600">/month · about {formatCurrency(perDay)} a day</p>
                    )}
                  </div>
                  <Button type="button" onClick={openConfirm} fullWidth size="lg" className="mt-5">
                    Upgrade to Storezn+
                  </Button>
                  <p className="mt-2 text-center text-xs text-slate-500">Pay by card · Cancel any time · Nothing is deleted if you stop</p>
                </>
              )}

              {isPlus && (
                <div className="mt-3 flex items-start gap-2.5 rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-500" />
                  <p>
                    {isEnterprise
                      ? "Your store is on Enterprise, which already includes everything in Storezn+."
                      : store.planCancelled
                        ? `Cancelled. You keep Storezn+ until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "your paid month ends"}.`
                        : `Renews ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "monthly"} for ${formatCurrency(plusMonthlyPrice)}.`}
                  </p>
                </div>
              )}

              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-slate-900">{isPlus ? "What you have" : "What you get"}</p>
                <FeatureList features={PLUS_FEATURES} />
              </div>

              {plusActive && !store.planCancelled && (
                <div className="mt-6 border-t border-slate-100 pt-4 text-center">
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    disabled={cancelling}
                    className="text-sm text-slate-600 underline hover:text-slate-900 disabled:opacity-50 cursor-pointer"
                  >
                    {cancelling ? "Cancelling..." : "Cancel subscription"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* -------- Storezn Enterprise -------- */}
          <div className="rounded-sm bg-neutral-950 p-5 sm:p-6 text-white">
            <div className="flex items-start justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80">
                <Building2 size={16} /> Enterprise
              </p>
              {isEnterprise && (
                <Badge color={store.planCancelled ? "amber" : "green"}>{store.planCancelled ? "Not renewing" : "Active"}</Badge>
              )}
            </div>
            <p className="mt-3 text-xl sm:text-2xl font-extrabold tracking-tight">A shop till for your counter</p>
            <p className="mt-1 text-sm text-white/70">For supermarkets, pharmacies and shops. Everything in Storezn+, plus:</p>
            {isEnterprise && (
              <p className="mt-4 rounded-sm bg-white/10 px-4 py-3 text-sm text-white/90">
                {store.planCancelled
                  ? `Your Enterprise term runs until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "the end of the paid period"}. Talk to us before then to keep it.`
                  : `Active${store.planRenewsAt ? ` until ${formatDate(store.planRenewsAt)}` : ""}. Renewals are arranged with the Storezn team.`}
              </p>
            )}
            <ul className="mt-5 space-y-2.5">
              {ENTERPRISE_FEATURES.map(({ title, text }) => (
                <li key={title} className="flex gap-2.5 text-sm">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-400" />
                  <span>
                    <span className="block font-medium text-white">{title}</span>
                    <span className="block text-white/65">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!isEnterprise && (
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Storezn Enterprise enquiry")}`}
                className="mt-6 flex items-center justify-center rounded-sm bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 transition-colors"
              >
                Talk to us about Enterprise
              </a>
            )}
            {!isEnterprise && <p className="mt-2 text-center text-xs text-white/50">Priced around your branches and tills. We set it up with you.</p>}
          </div>
        </>
      )}

      {transactions && transactions.length > 0 && (
        <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
          <p className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Receipt size={16} className="text-slate-500" />
            Billing history
          </p>
          <ul className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-slate-700">{formatDate(t.paidAt)}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{formatCurrency(t.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div className="relative bg-surface rounded-sm shadow-xl w-full max-w-sm p-6 space-y-5 my-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Confirm subscription</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(plusMonthlyPrice)}
                  <span className="text-sm font-medium text-slate-400">{discountPercent != null ? " first month" : "/month"}</span>
                </p>
              </div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                &times;
              </button>
            </div>

            <div className="bg-amber-100 border border-current/10 rounded-sm p-3 text-xs text-amber-800">
              {discountPercent != null
                ? `This is a recurring subscription. ${formatCurrency(plusMonthlyPrice)} will be charged today, then ${formatCurrency(plusStandardMonthlyPrice)} monthly from your next billing date until you cancel.`
                : `This is a recurring monthly charge. ${formatCurrency(plusMonthlyPrice)} will be deducted from your card automatically every month, starting today, until you cancel from this page.`}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span>
                {discountPercent != null
                  ? `I understand I'll be charged ${formatCurrency(plusMonthlyPrice)} today, then ${formatCurrency(plusStandardMonthlyPrice)} monthly until I cancel.`
                  : `I understand I'll be charged ${formatCurrency(plusMonthlyPrice)} every month until I cancel my subscription.`}
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
