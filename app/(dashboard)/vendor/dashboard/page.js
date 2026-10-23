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
  FileText,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { Card } from "@/components/ui/Card.js";
import { Alert } from "@/components/ui/Alert.js";
import { CopyableUrl } from "@/components/ui/CopyableUrl.js";
import { StoreQrCodeButton } from "@/components/ui/StoreQrCodeButton.js";
import { SetupGuideModal } from "@/components/ui/SetupGuideModal.js";
import {
  Skeleton,
  VendorDashboardSkeleton,
} from "@/components/ui/Skeleton.js";
import {
  formatCurrency,
  compactCurrency,
  compactNumber,
} from "@/lib/format.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { isPlusStore } from "@/lib/storePlan.js";
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

// Only shortcuts the vendor can actually use: recording an offline sale is
// a Storezn+ feature (a free store would land on an upgrade screen), and
// Verification drops out once it's approved.
function SHORTCUTS(storeId, isOwner, { canRecordOrder = false, verified = false, canUpgrade = false } = {}) {
  const shortcuts = [
    {
      label: "Add product",
      icon: Plus,
      href: `/vendor/products/new?storeId=${storeId}`,
    },
    ...(canRecordOrder ? [{ label: "Record a sale", icon: ClipboardList, href: "/vendor/orders/new" }] : []),
    // Opens the invoices page with the "New offline quote" form already up.
    { label: "Create invoice", icon: FileText, href: "/vendor/invoices?new=1" },
    { label: "Customers", icon: Users, href: "/vendor/customers" },
  ];
  // Payouts, store settings, verification, and the setup guide are all
  // owner-only concerns (see isOwner above) - left out of a staff
  // member's shortcuts entirely rather than linking somewhere they'd
  // just get turned away from.
  if (isOwner) {
    // Last on the list, and only while there's something to upgrade to -
    // a store already on Storezn+ or Enterprise doesn't get the nudge.
    if (canUpgrade) shortcuts.push({ label: "Upgrade business", icon: Sparkles, href: "/vendor/plus" });
    shortcuts.splice(
      2,
      0,
      { label: "Shipping", icon: Truck, href: "/vendor/shipping" },
      { label: "Payouts", icon: Wallet, href: "/vendor/payouts" },
      { label: "Store settings", icon: Settings, href: "/vendor/settings" },
      ...(verified ? [] : [{ label: "Verification", icon: ShieldCheck, href: "/vendor/verification" }]),
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
  const shortcuts = SHORTCUTS(storeId, isOwner, {
    canRecordOrder: !!store && isPlusStore(store),
    canUpgrade: !!store && !isPlusStore(store),
    verified: verification?.approvalStatus === "approved",
  });
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
            (installState.standalone ||
              installState.isIos ||
              !!installState.deferredPrompt),
          installDone: installState.standalone,
          installIsIos: installState.isIos,
          onInstall: handleInstallApp,
        })
      : [];
  const allStepsDone = steps.length > 0 && steps.every((s) => s.done);
  // Until every step is done, the guide opens each time the vendor comes
  // back to the dashboard. Closing it only hides it for this visit
  // (component state, not stored), so unfinished setup keeps resurfacing.
  const guideOpen =
    isOwner &&
    (guideForceOpen || (!!store && !allStepsDone && !guideDismissed));

  const closeGuide = () => {
    setGuideForceOpen(false);
    setGuideDismissed(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
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
                store.isActive === false
                  ? "bg-red-500"
                  : store.isOpen
                    ? "bg-brand-500"
                    : "bg-slate-400"
              }`}
            />
            {store.isActive === false
              ? "Store disabled"
              : store.isOpen
                ? "Store online"
                : "Store offline"}
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
        description={
          store ? "Here's how your store is doing today." : undefined
        }
        actions={
          // Side by side on phones too, rather than two full-width rows.
          <div className={`grid gap-2 sm:flex sm:items-center ${isOwner && steps.length > 0 && !allStepsDone ? "grid-cols-2" : "grid-cols-1"}`}>
            {isOwner && steps.length > 0 && !allStepsDone && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setGuideForceOpen(true)}
              >
                <ListChecks size={15} /> Setup guide
              </Button>
            )}
            <Link href="/vendor/help">
              <Button type="button" size="sm" variant="ghost">
                <HelpCircle size={15} /> Help
              </Button>
            </Link>
          </div>
        }
      />

      {stores.length === 0 ? (
        <p className="text-sm text-slate-700">
          No store set up yet, contact the platform admin.
        </p>
      ) : (
        <>
          {isOwner && store && verification?.approvalStatus === "approved" && (
            <Card className="bg-brand-50! border-brand-100! space-y-1.5 p-3! sm:p-5!">
              <p className="text-sm font-semibold text-slate-900">
                This is your website&apos;s link
              </p>
              <p className="hidden sm:block text-xs text-slate-800">
                Anyone who opens it can browse and buy from you, copy it and
                share it on WhatsApp, Instagram, anywhere.
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
                    Your NIN is under review, your store stays hidden from
                    customers until it&apos;s approved.
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
            <Alert
              tone="danger"
              icon={AlertTriangle}
              title={`${stats.products.oversold} oversold product${stats.products.oversold === 1 ? "" : "s"}`}
            >
              <p>
                These products have stock below zero and need reconciliation.{" "}
                <Link
                  href="/vendor/products?stock=oversold"
                  className="underline font-medium"
                >
                  Review oversold products
                </Link>
                .
              </p>
            </Alert>
          )}

          {statsLoading || !stats ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`bg-surface px-2.5 py-2.5 sm:px-4 sm:py-3.5 space-y-1.5 ${i >= 4 ? "sm:hidden" : ""}`}>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            (() => {
              const expired = stats.products.expired || 0;
              const expiring = stats.products.expiringSoon || 0;
              const items = [
                { key: "revenue", icon: Wallet, label: "Revenue", value: compactCurrency(stats.revenue), title: formatCurrency(stats.revenue), color: "green", href: "/vendor/payouts" },
                { key: "orders", icon: ShoppingBag, label: "Orders", value: stats.orders.total, sub: `${stats.orders.pending} in progress`, href: "/vendor/orders" },
                { key: "products", icon: Package, label: "Products", value: stats.products.total, sub: `${stats.products.live} live · ₦${compactNumber(stats.products.stockValue || 0)} value`, href: "/vendor/products" },
                { key: "low", icon: AlertTriangle, label: "Low stock", value: stats.products.lowStock, color: stats.products.lowStock > 0 ? "amber" : "brand", href: "/vendor/products?stock=low" },
                ...(expired + expiring > 0
                  ? [{
                      key: "expiry",
                      icon: CalendarClock,
                      label: expired > 0 ? "Expired" : "Expiring soon",
                      value: expired > 0 ? expired : expiring,
                      sub: expired > 0 ? `${expiring} more within 30 days` : "within 30 days",
                      color: expired > 0 ? "red" : "amber",
                      href: `/vendor/products?expiry=${expired > 0 ? "expired" : "soon"}`,
                    }]
                  : []),
                ...((stats.invoiceRequests?.open || 0) > 0
                  ? [{ key: "quotes", icon: ClipboardList, label: "Quote requests", value: stats.invoiceRequests.open, sub: "Waiting for your price", color: "accent", href: "/vendor/invoices/requests" }]
                  : []),
              ];
              // Every figure in one tight panel: three across on a phone,
              // a single strip on wider screens (sub-lines show there).
              // Blank cells fill out the phone's last row so the grid
              // lines stay even.
              const fillers = (3 - (items.length % 3)) % 3;
              const tone = { amber: "text-amber-700", red: "text-red-700", accent: "text-accent-700" };
              const wideCols = { 4: "sm:grid-cols-4", 5: "sm:grid-cols-5", 6: "sm:grid-cols-6" }[items.length] || "sm:grid-cols-4";
              return (
                <div className={`grid grid-cols-3 ${wideCols} gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200`}>
                  {items.map((item) => (
                    <Link key={item.key} href={item.href} className="bg-surface px-2.5 py-2.5 sm:px-4 sm:py-3.5 hover:bg-slate-50 active:bg-slate-50 transition-colors">
                      <p title={item.title} className={`text-base sm:text-xl font-bold tabular-nums leading-tight truncate ${tone[item.color] || "text-slate-900"}`}>
                        {typeof item.value === "number" ? compactNumber(item.value) : item.value}
                      </p>
                      <p className="mt-0.5 text-[11px] sm:text-xs text-slate-700 truncate">{item.label}</p>
                      {item.sub && <p className="hidden sm:block mt-0.5 text-xs text-slate-500 truncate">{item.sub}</p>}
                    </Link>
                  ))}
                  {Array.from({ length: fillers }, (_, i) => <div key={`fill-${i}`} className="sm:hidden bg-surface" />)}
                </div>
              );
            })()
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800 mb-2 sm:mb-2.5">
              Quick actions
            </p>
            {/* Compact buttons: two even columns on a phone, more across on wider screens. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {shortcuts.map(({ label, icon: Icon, href, onClick }, index) => {
                // An odd last button takes the whole row instead of half.
                const span = shortcuts.length % 2 === 1 && index === shortcuts.length - 1 ? "col-span-2 sm:col-span-1 " : "";
                const chip = span + "flex items-center gap-2 h-10 px-3 rounded-sm border border-slate-200 bg-surface text-sm font-medium text-slate-800 hover:border-brand-300 hover:bg-brand-50/50 active:bg-brand-50 transition-colors cursor-pointer min-w-0";
                const content = (<><Icon size={16} className="shrink-0 text-brand-700" /><span className="truncate">{label}</span></>);
                return href ? (
                  <Link key={label} href={href} className={chip}>{content}</Link>
                ) : (
                  <button key={label} type="button" onClick={onClick} className={chip}>{content}</button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
