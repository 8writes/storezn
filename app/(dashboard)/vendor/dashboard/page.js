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
import { PageHeader } from "@/components/ui/PageHeader.js";
import { Card } from "@/components/ui/Card.js";
import { Alert } from "@/components/ui/Alert.js";
import { CopyableUrl } from "@/components/ui/CopyableUrl.js";
import { StoreQrCodeButton } from "@/components/ui/StoreQrCodeButton.js";
import { SetupGuideModal } from "@/components/ui/SetupGuideModal.js";
import {
  StatGridSkeleton,
  VendorDashboardSkeleton,
} from "@/components/ui/Skeleton.js";
import { formatCurrency, compactCurrency, compactNumber } from "@/lib/format.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { installPwa, usePwaInstall } from "@/lib/pwaInstall.js";
import {
  pushSupported,
  getPushSubscription,
  subscribeToPush,
} from "@/lib/pushClient.js";

function buildSetupSteps({
  store,
  verification,
  stats,
  pushSubscribed,
  onEnablePush,
  installAvailable,
  installDone,
  installIsIos,
  onInstall,
}) {
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
      description:
        "This is where your money gets paid whenever someone buys online.",
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
      description:
        "So you don't miss new orders, low stock alerts, or verification updates.",
      done: pushSubscribed,
      cta: "Turn on",
      onAction: onEnablePush,
    });
  }

  if (installAvailable) {
    steps.push({
      label: "Install the Storezn app",
      description: installIsIos
        ? "Tap Share, then Add to Home Screen for faster access."
        : "Open Storezn from your home screen for faster access.",
      done: installDone,
      cta: installIsIos ? "How to install" : "Install app",
      onAction: onInstall,
    });
  }

  return steps;
}

function SHORTCUTS(storeId, isOwner) {
  const shortcuts = [
    {
      label: "Add product",
      icon: Plus,
      href: `/vendor/products/new?storeId=${storeId}`,
    },
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
      {
        label: "Verification",
        icon: ShieldCheck,
        href: "/vendor/verification",
      },
    );
  }
  return shortcuts;
}

export default function VendorDashboardPage() {
  const { user, token } = useAuth(true);
  const installState = usePwaInstall();
  const { apiFetch } = useApi(token);
  const router = useRouter();
  const { stores, storeId, loading, updateStore } = useVendorStore();
  const [togglingOpen, setTogglingOpen] = useState(false);

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

  const handleInstallApp = async () => {
    if (installState.isIos) {
      toast.info("Tap Share, then Add to Home Screen.");
      return;
    }
    await installPwa();
  };

  // Quick "your store is closed - reopen it" toggle. The full status
  // control (and the reverse, closing the store) lives on /vendor/settings.
  const handleGoOnline = async () => {
    setTogglingOpen(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ isOpen: true }),
      });
      updateStore(data.store);
      toast.success("Your store is now online");
    } catch (err) {
      toast.error(err.message || "Couldn't update store status");
    } finally {
      setTogglingOpen(false);
    }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const steps =
    store && isOwner
      ? buildSetupSteps({
          store,
          verification,
          stats,
          pushSubscribed,
          onEnablePush: handleEnablePush,
          installAvailable:
            installState.ready &&
            installState.isPlatformHost &&
            (installState.standalone || installState.isIos || !!installState.deferredPrompt),
          installDone: installState.standalone,
          installIsIos: installState.isIos,
          onInstall: handleInstallApp,
        })
      : [];
  const allStepsDone = steps.length > 0 && steps.every((s) => s.done);
  // Read once per render, only reached after the client-only fetches above
  // have already resolved (loading is false) - never evaluated during SSR
  // or the initial hydration pass, so there's no server/client mismatch to
  // guard against here the way a top-level "on mount" read would need.
  const dismissKey = store ? `setup_guide_dismissed_${store.id}` : null;
  const previouslyDismissed =
    dismissKey &&
    typeof window !== "undefined" &&
    !!localStorage.getItem(dismissKey);
  const guideOpen =
    isOwner &&
    (guideForceOpen ||
      (!!store && !allStepsDone && !guideDismissed && !previouslyDismissed));

  const closeGuide = () => {
    setGuideForceOpen(false);
    setGuideDismissed(true);
    if (dismissKey) localStorage.setItem(dismissKey, "1");
  };

  return (
    <div className="space-y-6">
      {isOwner && (
        <SetupGuideModal open={guideOpen} onClose={closeGuide} steps={steps} />
      )}

      {isOwner && store && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              store.isActive === false
                ? "text-red-600"
                : store.isOpen
                  ? "text-brand-700"
                  : "text-slate-800"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                store.isActive === false ? "bg-red-500" : store.isOpen ? "bg-brand-500" : "bg-slate-400"
              }`}
            />
            {store.isActive === false ? "Store disabled" : store.isOpen ? "Store online" : "Store offline"}
          </span>
          {store.isActive !== false && !store.isOpen && (
            <button
              type="button"
              onClick={handleGoOnline}
              disabled={togglingOpen}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 disabled:opacity-50 cursor-pointer"
            >
              {togglingOpen ? "Updating…" : "Go online"}
            </button>
          )}
        </div>
      )}

      <PageHeader
        title={`Welcome, ${user?.firstName || ""}`.trim()}
        description={store ? "Here's how your store is doing today." : undefined}
        actions={
          <>
            {isOwner && steps.length > 0 && !allStepsDone && (
              <Button type="button" size="sm" variant="outline" onClick={() => setGuideForceOpen(true)}>
                <ListChecks size={15} /> Setup guide
              </Button>
            )}
            <Link href="/vendor/help">
              <Button type="button" size="sm" variant="ghost">
                <HelpCircle size={15} /> Help
              </Button>
            </Link>
          </>
        }
      />

      {stores.length === 0 ? (
        <p className="text-sm text-slate-700">
          No store set up yet, contact the platform admin.
        </p>
      ) : (
        <>
          {isOwner && store && verification?.approvalStatus === "approved" && (
            <Card className="bg-brand-50! border-brand-100! space-y-1.5">
              <p className="text-sm font-semibold text-slate-900">
                This is your website&apos;s link
              </p>
              <p className="text-xs text-slate-800">
                Anyone who opens it can browse and buy from you, copy it
                and share it on WhatsApp, Instagram, anywhere.
              </p>
              <div className="pt-1">
                <CopyableUrl
                  url={getStorefrontUrl(store)}
                  shareTitle={store.name}
                  extra={
                    <StoreQrCodeButton
                      storeName={store.name}
                      storeUrl={getStorefrontUrl(store)}
                    />
                  }
                />
              </div>
            </Card>
          )}

          {isOwner &&
            store &&
            verification &&
            verification.approvalStatus !== "approved" && (
              <Card pad="sm" className="max-w-md border-dashed bg-slate-50!">
                <p className="text-sm font-semibold text-slate-800">
                  Your website&apos;s link will appear here
                </p>
                <p className="text-xs text-slate-800 mt-0.5">
                  Once your identity is verified below, you&apos;ll get a
                  shareable link customers can use to shop from you.
                </p>
              </Card>
            )}

          {isOwner &&
            verification &&
            verification.approvalStatus !== "approved" && (
              <Alert
                tone="warning"
                icon={ShieldAlert}
                title={
                  verification.approvalStatus === "rejected"
                    ? "Identity verification rejected"
                    : verification.nin
                      ? "Identity verification pending"
                      : "Verify your identity"
                }
              >
                {verification.approvalStatus === "rejected" ? (
                  <p>
                    Your store stays hidden from customers until this is
                    resolved.{" "}
                    <Link
                      href="/vendor/verification"
                      className="underline font-medium"
                    >
                      Resubmit your NIN
                    </Link>
                    .
                  </p>
                ) : verification.nin ? (
                  <p>
                    Your NIN is under review, your store stays hidden
                    from customers until it&apos;s approved.
                  </p>
                ) : (
                  <p>
                    Customers can&apos;t see or order from your store until
                    you&apos;re verified.{" "}
                    <Link
                      href="/vendor/verification"
                      className="underline font-medium"
                    >
                      Submit your NIN
                    </Link>
                    .
                  </p>
                )}
              </Alert>
            )}

          {isOwner && store && !store.subAccountCode && (
            <Alert tone="warning" title="Payment setup incomplete">
              <p>
                Customers can&apos;t check out from your store yet.{" "}
                <Link href="/vendor/payouts" className="underline font-medium">
                  Finish payment setup
                </Link>
                .
              </p>
            </Alert>
          )}

          {!statsLoading && stats?.products?.oversold > 0 && (
            <Alert tone="danger" icon={AlertTriangle} title={`${stats.products.oversold} oversold product${stats.products.oversold === 1 ? "" : "s"}`}>
              <p>
                These products have stock below zero and need reconciliation.{" "}
                <Link href="/vendor/products?stock=oversold" className="underline font-medium">
                  Review oversold products
                </Link>
                .
              </p>
            </Alert>
          )}

          {statsLoading || !stats ? (
            <StatGridSkeleton count={5} />
          ) : (
            (() => {
              const showExpiry =
                (stats.products.expiringSoon || 0) +
                  (stats.products.expired || 0) >
                0;
              return (
                <div
                  className={`grid grid-cols-2 gap-3 ${showExpiry ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"}`}
                >
                  <StatCard
                    icon={Wallet}
                    label="Revenue"
                    value={compactCurrency(stats.revenue)}
                    title={formatCurrency(stats.revenue)}
                    color="green"
                    href="/vendor/payouts"
                  />
                  <StatCard
                    icon={ShoppingBag}
                    label="Orders"
                    value={stats.orders.total}
                    sub={`${stats.orders.pending} in progress`}
                    href="/vendor/orders"
                  />
                  <StatCard
                    icon={Package}
                    label="Products"
                    value={stats.products.total}
                    sub={`${stats.products.live} live · ₦${compactNumber(stats.products.stockValue || 0)} value`}
                    href="/vendor/products"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Low stock"
                    value={stats.products.lowStock}
                    color={stats.products.lowStock > 0 ? "amber" : "brand"}
                    href="/vendor/products?stock=low"
                  />
                  <StatCard
                    className="col-span-2"
                    icon={ClipboardList}
                    label="Invoice requests"
                    value={stats.invoiceRequests?.open || 0}
                    sub="Awaiting pricing"
                    color={stats.invoiceRequests?.open > 0 ? "accent" : "brand"}
                    href="/vendor/invoices/requests"
                  />
                  {showExpiry && (
                    <StatCard
                      className="col-span-2 sm:col-span-1"
                      icon={CalendarClock}
                      label={
                        stats.products.expired > 0
                          ? "Expired / expiring"
                          : "Expiring soon"
                      }
                      value={
                        stats.products.expired > 0
                          ? stats.products.expired
                          : stats.products.expiringSoon
                      }
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800 mb-2.5">
              Quick actions
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {SHORTCUTS(storeId, isOwner).map(
                ({ label, icon: Icon, href, onClick }) => {
                  const content = (
                    <>
                      <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                        <Icon size={17} />
                      </span>
                      <span className="text-xs font-medium text-slate-600 text-center leading-tight">
                        {label}
                      </span>
                    </>
                  );
                  const className =
                    "group flex flex-col items-center justify-center gap-2 bg-surface border border-slate-200 rounded-sm shadow-xs p-4 " +
                    "transition-[box-shadow,border-color] duration-150 hover:shadow-sm hover:border-brand-300 cursor-pointer";
                  return href ? (
                    <Link key={label} href={href} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className={className}
                    >
                      {content}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
