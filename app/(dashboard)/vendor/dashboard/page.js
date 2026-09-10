"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Package,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  Plus,
  ShieldAlert,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  HelpCircle,
  ListChecks,
  ClipboardList,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { CopyableUrl } from "@/components/ui/CopyableUrl.js";
import { StoreQrCodeButton } from "@/components/ui/StoreQrCodeButton.js";
import { SetupGuideModal } from "@/components/ui/SetupGuideModal.js";
import { StatGridSkeleton, VendorDashboardSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { pushSupported, getPushSubscription, subscribeToPush } from "@/lib/pushClient.js";

function buildSetupSteps({ store, verification, stats, pushSubscribed, onEnablePush }) {
  const steps = [
    {
      label: "Verify your identity",
      description: "Customers can't see your store until this is approved.",
      done: verification?.approvalStatus === "approved",
      href: "/vendor/verification",
    },
    {
      label: "Add your logo",
      description: "Helps customers recognize and trust your store.",
      done: !!store.logoUrl,
      href: "/vendor/settings",
    },
    {
      label: "Link your bank account",
      description: "This is where your money gets paid whenever someone buys online.",
      done: !!store.subAccountCode,
      href: "/vendor/payouts",
    },
    {
      label: "Add your first product",
      description: "Customers need something to buy.",
      done: (stats?.products?.total ?? 0) > 0,
      href: `/vendor/products/new?storeId=${store.id}`,
      cta: "Add product ",
    },
  ];

  // Skipped entirely on browsers that can't do push at all, same as
  // PushNotificationToggle - no point nagging for something unattainable.
  if (pushSupported()) {
    steps.push({
      label: "Turn on push notifications",
      description: "So you don't miss new orders, low stock alerts, or verification updates.",
      done: pushSubscribed,
      cta: "Turn on",
      onAction: onEnablePush,
    });
  }

  return steps;
}

function SHORTCUTS(storeId, onOpenGuide, isOwner) {
  const shortcuts = [
    { label: "Add product", icon: Plus, href: `/vendor/products/new?storeId=${storeId}` },
    { label: "Products", icon: Package, href: "/vendor/products" },
    { label: "Orders", icon: ShoppingBag, href: "/vendor/orders" },
    { label: "Record order", icon: ClipboardList, href: "/vendor/orders/new" },
    { label: "Customers", icon: Users, href: "/vendor/customers" },
    { label: "Shipping", icon: Truck, href: "/vendor/shipping" },
    { label: "Help", icon: HelpCircle, href: "/vendor/help" },
  ];
  // Payouts, store settings, verification, and the setup guide are all
  // owner-only concerns (see isOwner above) - left out of a staff
  // member's shortcuts entirely rather than linking somewhere they'd
  // just get turned away from.
  if (isOwner) {
    shortcuts.splice(
      2,
      0,
      { label: "Payouts", icon: Wallet, href: "/vendor/payouts" },
      { label: "Store settings", icon: Settings, href: "/vendor/settings" },
      { label: "Verification", icon: ShieldCheck, href: "/vendor/verification" },
    );
    shortcuts.push({ label: "Setup guide", icon: ListChecks, onClick: onOpenGuide });
  }
  return shortcuts;
}

export default function VendorDashboardPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const router = useRouter();
  const { stores, storeId, loading } = useVendorStore();

  // The dashboard is the store owner's home - staff get sent to their
  // own landing (Products) if they navigate here directly.
  useEffect(() => {
    if (user && user.role === "staff") router.replace("/vendor/products");
  }, [user, router]);
  const [stats, setStats] = useState(null);
  const [verification, setVerification] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [guideForceOpen, setGuideForceOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if (!token) return;
    // Fetched fresh rather than read off the cached login user object -
    // approvalStatus can change any time an admin reviews it, and the
    // dashboard should reflect that without requiring a re-login.
    apiFetch("/api/v1/vendor/verification")
      .then(setVerification)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    getPushSubscription()
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const handleEnablePush = async () => {
    await subscribeToPush(token);
    setPushSubscribed(true);
    toast.success("Notifications enabled");
  };

  useEffect(() => {
    // Also gated on token, not just storeId: storeId comes from the
    // shared VendorStoreContext, which on a client-side navigation (as
    // opposed to a full reload) is already populated from before this
    // page even mounted - but this page's own useAuth() token starts
    // null again on every fresh mount and takes a render to resolve. Without
    // this guard, the fetch fires with no Authorization header the instant
    // storeId is already truthy, before token catches up.
    if (!token || !storeId) return;
    setStatsLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/stats`)
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const store = stores.find((s) => s.id === storeId);

  if (loading) {
    return <VendorDashboardSkeleton />;
  }

  // Staff never see the owner dashboard - the effect above bounces them
  // to Products; render nothing here so there's no flash of owner content.
  if (user && user.role === "staff") return null;

  // Setup steps, the store link, and the verification/payment nudges are
  // all the owner's own concerns - a staff member can't act on any of
  // them (identity verification and payout linking are owner-only, see
  // isStoreOwner in lib/auth.js), so none of it is shown to them.
  const isOwner = user?.role === "vendor";
  const steps = store && isOwner ? buildSetupSteps({ store, verification, stats, pushSubscribed, onEnablePush: handleEnablePush }) : [];
  const allStepsDone = steps.length > 0 && steps.every((s) => s.done);
  // Read once per render, only reached after the client-only fetches above
  // have already resolved (loading is false) - never evaluated during SSR
  // or the initial hydration pass, so there's no server/client mismatch to
  // guard against here the way a top-level "on mount" read would need.
  const dismissKey = store ? `setup_guide_dismissed_${store.id}` : null;
  const previouslyDismissed = dismissKey && typeof window !== "undefined" && !!localStorage.getItem(dismissKey);
  const guideOpen = isOwner && (guideForceOpen || (!!store && !allStepsDone && !guideDismissed && !previouslyDismissed));

  const closeGuide = () => {
    setGuideForceOpen(false);
    setGuideDismissed(true);
    if (dismissKey) localStorage.setItem(dismissKey, "1");
  };

  return (
    <div className="space-y-6">
      {isOwner && <SetupGuideModal open={guideOpen} onClose={closeGuide} steps={steps} />}

      <div className="flex flex-col items-start gap-3">
        <h1 className="text-xl font-bold text-slate-900">Welcome, {user?.firstName}
        </h1>
      </div>

      {stores.length === 0 ? (
        <p className="text-sm text-slate-700">No store set up yet, contact the platform admin.</p>
      ) : (
        <>
          {isOwner && store && verification?.approvalStatus === "approved" && (
            <div className="space-y-1.5 bg-brand-50 border border-brand-100 rounded-sm p-4">
              <label className="text-sm font-semibold text-slate-900">This is your store&apos;s link</label>
              <p className="text-xs text-slate-500">Anyone who opens it can browse and buy from you - copy it and share it on WhatsApp, Instagram, anywhere.</p>
              <div className="pt-1">
                <CopyableUrl
                  url={getStorefrontUrl(store)}
                  shareTitle={store.name}
                  extra={<StoreQrCodeButton storeName={store.name} storeUrl={getStorefrontUrl(store)} />}
                />
              </div>
            </div>
          )}

          {isOwner && store && verification && verification.approvalStatus !== "approved" && (
            <div className="max-w-md bg-slate-50 border border-dashed border-slate-200 rounded-sm p-4">
              <p className="text-sm font-semibold text-slate-500">Your store&apos;s link will appear here</p>
              <p className="text-xs text-slate-700 mt-0.5">Once your identity is verified below, you&apos;ll get a shareable link customers can use to shop from you.</p>
            </div>
          )}

          {isOwner && verification && verification.approvalStatus !== "approved" && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                {verification.approvalStatus === "rejected" ? (
                  <>
                    <p className="font-medium">Identity verification rejected</p>
                    <p>
                      Your store stays hidden from customers until this is resolved.{" "}
                      <Link href="/vendor/verification" className="underline font-medium">Resubmit your NIN</Link>.
                    </p>
                  </>
                ) : verification.nin ? (
                  <>
                    <p className="font-medium">Identity verification pending</p>
                    <p>Your NIN is under review - your store stays hidden from customers until it&apos;s approved.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Verify your identity</p>
                    <p>
                      Customers can&apos;t see or order from your store until you&apos;re verified.{" "}
                      <Link href="/vendor/verification" className="underline font-medium">Submit your NIN</Link>.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {isOwner && store && !store.subAccountCode && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Payment setup incomplete</p>
                <p>Customers can&apos;t check out from your store yet. <Link href="/vendor/payouts" className="underline font-medium">Finish payment setup</Link>.</p>
              </div>
            </div>
          )}

          {statsLoading || !stats ? (
            <StatGridSkeleton count={4} />
          ) : (
            (() => {
              const showExpiry = (stats.products.expiringSoon || 0) + (stats.products.expired || 0) > 0;
              return (
                <div className={`grid grid-cols-2 gap-3 ${showExpiry ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"}`}>
                  <StatCard icon={Wallet} label="Revenue (your payout)" value={formatCurrency(stats.revenue)} color="green" href="/vendor/payouts" />
                  <StatCard icon={ShoppingBag} label="Orders" value={stats.orders.total} sub={`${stats.orders.pending} in progress`} href="/vendor/orders" />
                  <StatCard icon={Package} label="Products" value={stats.products.total} sub={`${stats.products.live} live`} href="/vendor/products" />
                  <StatCard
                    icon={AlertTriangle}
                    label="Low stock"
                    value={stats.products.lowStock}
                    color={stats.products.lowStock > 0 ? "amber" : "brand"}
                    href="/vendor/products?stock=low"
                  />
                  {showExpiry && (
                    <StatCard
                      icon={CalendarClock}
                      label={stats.products.expired > 0 ? "Expired / expiring" : "Expiring soon"}
                      value={stats.products.expired > 0 ? stats.products.expired : stats.products.expiringSoon}
                      sub={
                        stats.products.expired > 0
                          ? `${stats.products.expiringSoon} more within 30 days`
                          : "within 30 days"
                      }
                      color={stats.products.expired > 0 ? "red" : "amber"}
                      href={`/vendor/products?expiry=${stats.products.expired > 0 ? "expired" : "soon"}`}
                    />
                  )}
                </div>
              );
            })()
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Quick actions</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {SHORTCUTS(storeId, () => setGuideForceOpen(true), isOwner).map(({ label, icon: Icon, href, onClick }) => {
                const content = (
                  <>
                    <Icon size={20} className="text-brand-600" />
                    <span className="text-xs font-medium text-slate-700 text-center leading-tight">{label}</span>
                  </>
                );
                const className = "flex flex-col items-center justify-center gap-2 bg-surface border border-slate-200 rounded-sm p-4 hover:border-brand-300 hover:bg-brand-50/50 transition-colors cursor-pointer";
                return href ? (
                  <Link key={label} href={href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button key={label} type="button" onClick={onClick} className={className}>
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
