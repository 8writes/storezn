"use client";
import { useState, useEffect } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { MobileNavDrawer } from "@/components/ui/MobileNavDrawer.js";
import { StoreSwitcher } from "@/components/ui/StoreSwitcher.js";
import { VendorStoreProvider } from "@/components/VendorStoreContext.js";
import { Skeleton } from "@/components/ui/Skeleton.js";
import { POST_AUTH_REDIRECT_KEY } from "@/lib/postAuthRedirect.js";
import {
  Menu,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Settings,
  BarChart3,
  Package,
  ShoppingBag,
  User,
  Users,
  Truck,
  ShieldCheck,
  Wallet,
  HelpCircle,
  Receipt,
  Bell,
  UserCog,
  Sparkles,
  Building2,
  History,
  Tags,
  Calculator,
} from "lucide-react";
import Image from "next/image";
import { PullToRefresh } from "@/components/ui/PullToRefresh.js";
import UpdatePrompt from "@/app/UpdatePrompt.js";
import { OfflineNavGuard } from "@/components/pos/OfflineNavGuard.js";
import { isOffline, onConnectivityChange } from "@/lib/connectivity.js";

// Grouped so the sidebar reads as sections instead of one flat list of 9+
// items - each group is a distinct concern (running the store day-to-day
// vs. one-time setup vs. account-level stuff).
const NAV_BY_ROLE = {
  super_admin: [
    {
      title: "Overview",
      items: [{ href: "/super-admin/analytics", label: "Overview", icon: BarChart3 }],
    },
    {
      title: "Marketplace",
      items: [
        { href: "/super-admin/stores", label: "Stores", icon: Store },
        { href: "/super-admin/vendors", label: "Vendors", icon: ShieldCheck },
        { href: "/super-admin/products", label: "Products", icon: Package },
        { href: "/super-admin/orders", label: "Orders", icon: ShoppingBag },
        { href: "/super-admin/transactions", label: "Transactions", icon: Receipt },
        { href: "/super-admin/customers", label: "Customers", icon: Users },
      ],
    },
    {
      title: "Platform",
      items: [
        { href: "/super-admin/notifications", label: "Notify vendors", icon: Bell },
        { href: "/super-admin/settings", label: "Platform settings", icon: Settings },
      ],
    },
    {
      title: "Team",
      items: [
        { href: "/super-admin/team", label: "Team", icon: UserCog },
        { href: "/super-admin/activity-log", label: "Activity log", icon: History },
      ],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
  // Everything super_admin can do/see except platform settings and team
  // management (see /super-admin/team - creating more admin/p_staff
  // accounts stays super_admin-only, a privilege-escalation guard).
  admin: [
    {
      title: "Overview",
      items: [{ href: "/super-admin/analytics", label: "Overview", icon: BarChart3 }],
    },
    {
      title: "Marketplace",
      items: [
        { href: "/super-admin/stores", label: "Stores", icon: Store },
        { href: "/super-admin/vendors", label: "Vendors", icon: ShieldCheck },
        { href: "/super-admin/products", label: "Products", icon: Package },
        { href: "/super-admin/orders", label: "Orders", icon: ShoppingBag },
        { href: "/super-admin/transactions", label: "Transactions", icon: Receipt },
        { href: "/super-admin/customers", label: "Customers", icon: Users },
      ],
    },
    {
      title: "Platform",
      items: [{ href: "/super-admin/notifications", label: "Notify vendors", icon: Bell }],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
  // Scoped to products (full access) plus read-only orders/transactions -
  // see the requireRole arrays across app/api/v1/super-admin/**.
  p_staff: [
    {
      title: "Work",
      items: [
        { href: "/super-admin/products", label: "Products", icon: Package },
        { href: "/super-admin/orders", label: "Orders", icon: ShoppingBag },
        { href: "/super-admin/transactions", label: "Transactions", icon: Receipt },
      ],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
  vendor: [
    {
      title: "Store",
      items: [
        { href: "/vendor/dashboard", label: "Dashboard", icon: Store },
        { href: "/vendor/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/vendor/reports", label: "Monthly report", icon: Receipt },
        { href: "/vendor/products", label: "Products", icon: Package },
        { href: "/vendor/categories", label: "Categories", icon: Tags },
        { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
        { href: "/vendor/pos", label: "Sell (POS)", icon: Calculator },
        { href: "/vendor/customers", label: "Customers", icon: Users },
      ],
    },
    {
      title: "Finance",
      items: [
        { href: "/vendor/payouts", label: "Payouts", icon: Wallet },
        { href: "/vendor/plus", label: "Storezn Plus", icon: Sparkles },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/vendor/settings", label: "Store settings", icon: Settings },
        { href: "/vendor/shipping", label: "Shipping", icon: Truck },
        { href: "/vendor/pos/registers", label: "Registers", icon: Calculator },
        { href: "/vendor/verification", label: "Verification", icon: ShieldCheck },
      ],
    },
    {
      title: "Team",
      items: [
        { href: "/vendor/staff", label: "Staff", icon: UserCog },
        { href: "/vendor/branches", label: "Branches", icon: Building2 },
        { href: "/vendor/activity", label: "Activity log", icon: History },
      ],
    },
    {
      title: "Support",
      items: [{ href: "/vendor/help", label: "Help", icon: HelpCircle }],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
  // Trimmed vendor nav - a staff member helps run the store day-to-day
  // (see canManageStore in lib/auth.js) but never sees payouts,
  // verification, or the staff list itself (isStoreOwner-gated, both at
  // the API and in vendor/staff/page.js's own guard). Store settings
  // stays in, though - staff can edit it (canManageStore covers it), and
  // it's also where the push-notification toggle lives, which staff need
  // too now that new-order/low-stock pushes go to the whole store team
  // (see sendPushToStore in lib/push.js), not just the owner.
  staff: [
    {
      title: "Store",
      items: [
        { href: "/vendor/products", label: "Products", icon: Package },
        { href: "/vendor/categories", label: "Categories", icon: Tags },
        { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
        { href: "/vendor/pos", label: "Sell (POS)", icon: Calculator },
        { href: "/vendor/customers", label: "Customers", icon: Users },
        { href: "/vendor/settings", label: "Store settings", icon: Settings },
      ],
    },
    {
      title: "Support",
      items: [{ href: "/vendor/help", label: "Help", icon: HelpCircle }],
    },
    {
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
};

// Fixed-size, always-rendered so it never shifts the link's layout -
// visible/animated only once pending, and delayed 80ms so an
// already-prefetched (near-instant) navigation never flashes it. Confirms
// the click registered even before the target route's loading.js fallback
// has a chance to paint.
function NavLinkHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`nav-link-hint ${pending ? "is-pending" : ""}`} />;
}

// Vendor/staff get a calmer, low-contrast nav (light sidebar, thin accent
// instead of a solid fill) - super_admin keeps the original dark sidebar
// untouched, see DashboardLayout's isVendor split.
// While offline, every dashboard page except the register needs the
// network to load anything - a click just lands on a blank/broken screen
// and (with a POS session active) OfflineNavGuard yanks you back anyway.
// So when `offline`, everything but the POS link renders inert.
const OFFLINE_OK_HREF = "/vendor/pos";

function NavLinks({ groups, pathname, onNavigate, muted = false, offline = false, collapsed = false }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.title}>
          {collapsed ? (
            <div className={`mx-3 my-2 border-t first:border-t-0 ${muted ? "border-slate-200" : "border-white/10"}`} />
          ) : (
            <p
              className={`px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider first:pt-2 ${
                muted ? "text-slate-400" : "text-white/40"
              }`}
            >
              {group.title}
            </p>
          )}
          {group.items.map(({ href, label, icon: Icon }) => {
            const base = `flex items-center gap-3 text-sm font-medium ${collapsed ? "px-0 py-2.5 justify-center" : "px-4 py-2.5"}`;

            if (offline && href !== OFFLINE_OK_HREF) {
              return (
                <span
                  key={href}
                  aria-disabled="true"
                  title={collapsed ? `${label} — unavailable while offline` : "Unavailable while offline"}
                  className={`${base} ${muted ? "border-l-2 border-transparent text-slate-600" : "text-white"} opacity-40 cursor-not-allowed select-none`}
                >
                  <Icon size={18} />
                  {!collapsed && label}
                </span>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={
                  muted
                    ? `${base} border-l-2 transition-colors ${
                        pathname === href
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    : `${base} transition-colors ${
                        pathname === href
                          ? "bg-brand-600 text-white"
                          : "text-white hover:bg-white/10"
                      }`
                }
              >
                <Icon size={18} />
                {!collapsed && label}
                {!collapsed && <NavLinkHint />}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function DashboardLayout({ children }) {
  const { user, token, loading, logout } = useAuth(true);
  const { apiFetch } = useApi(token);
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  // Desktop sidebar collapse (icons only). Remembered per browser.
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem("nav_collapsed") === "1");
    } catch {
      /* private mode / blocked storage - just start expanded */
    }
  }, []);
  const toggleNav = () => {
    setNavCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("nav_collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Drives the sidebar going inert (see NavLinks' `offline` prop) so a
  // click never starts a navigation that can only fail. Uses the shared
  // connectivity signal (lib/connectivity.js) - it flips the moment a
  // real request fails, not only when the OS drops the interface, so a
  // dead uplink on live Wi-Fi is caught too.
  useEffect(() => {
    setOffline(isOffline());
    return onConnectivityChange(setOffline);
  }, []);

  // A signup-time "?next=" (e.g. from the Storezn+ pricing card) is
  // stashed in localStorage since signup doesn't auto-login (email
  // verification comes first, see app/(auth)/signup/page.js) - applied
  // here rather than in the login page itself, since this is the one
  // place it's safe regardless of which account actually logs in: only
  // vendors ever get redirected (a super_admin or staff hitting a stashed
  // vendor-only URL like /vendor/settings would otherwise crash, since
  // VendorStoreProvider below only wraps for isVendor accounts).
  useEffect(() => {
    if (loading || !user || user.role !== "vendor") return;
    const stashedNext = localStorage.getItem(POST_AUTH_REDIRECT_KEY);
    if (!stashedNext) return;
    localStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    router.replace(stashedNext);
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex">
        <div className="hidden sm:block sm:w-60 shrink-0 bg-brand-900" />
        <div className="flex-1 p-4 sm:p-8 space-y-6 bg-slate-100">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const groups = NAV_BY_ROLE[user.role] || [];
  // Staff share the vendor dashboard shell (StoreSwitcher, VendorStoreProvider)
  // scoped to the one store they were invited to - see canManageStore in
  // lib/auth.js and /api/v1/vendor/stores' staff branch.
  const isVendor = user.role === "vendor" || user.role === "staff";
  // Only vendor/staff have an offline flow worth protecting (the
  // register); super-admin nav is left alone.
  const navOffline = isVendor && offline;

  const layout = (
    // Sticky sidebar, not a fixed-height internally-scrolled container -
    // see school-app's layout.js for why: nested overflow containers get
    // the 100vh math wrong across embedded webviews/mobile browser chrome
    // and end up dragging the sidebar away as the page scroll.
    <div className="min-h-screen flex">
      {/* offset clears the sticky mobile header (h-16 = 64px) plus a
          small gap - top-right on desktop sits below nothing (the
          sidebar has no top bar), but the fixed offset doesn't hurt
          there either. */}
      <Toaster position="top-right" offset="80px" mobileOffset="80px" closeButton={true} />
      <UpdatePrompt />
      {isVendor && <OfflineNavGuard />}

      <aside
        className={`hidden sm:flex shrink-0 flex-col h-dvh sticky top-0 transition-[width] duration-150 ${
          navCollapsed ? "sm:w-16" : "sm:w-60"
        } ${isVendor ? "bg-white border-r border-slate-200" : "bg-brand-900"}`}
      >
        <div className={`flex items-center h-16 border-b shrink-0 ${navCollapsed ? "justify-center px-0" : "px-4"} ${isVendor ? "border-slate-200" : "border-slate-800"}`}>
          {navCollapsed ? (
            <span className={`text-lg font-extrabold ${isVendor ? "text-slate-900" : "text-white"}`}>S</span>
          ) : isVendor ? (
            <StoreSwitcher textClassName="text-slate-900 font-extrabold tracking-tight text-sm" />
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          <NavLinks groups={groups} pathname={pathname} muted={isVendor} offline={navOffline} collapsed={navCollapsed} />
        </nav>
        <div className={`border-t shrink-0 ${isVendor ? "border-slate-200" : "border-slate-800"}`}>
          <button
            type="button"
            onClick={toggleNav}
            title={navCollapsed ? "Expand menu" : "Collapse menu"}
            className={`w-full flex items-center gap-3 py-2.5 cursor-pointer text-sm font-medium ${navCollapsed ? "justify-center px-0" : "px-4"} ${
              isVendor ? "text-slate-500 hover:bg-slate-50 hover:text-slate-900" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!navCollapsed && "Collapse"}
          </button>
          <button
            type="button"
            onClick={logout}
            disabled={navOffline}
            title={navOffline ? "Unavailable while offline" : navCollapsed ? "Sign out" : undefined}
            className={`w-full flex items-center gap-3 py-3 text-sm font-medium ${navCollapsed ? "justify-center px-0" : "px-4"} ${
              navOffline ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            } ${isVendor ? "text-slate-600 hover:bg-slate-50 hover:text-red-600" : "text-white hover:bg-white/10"}`}
          >
            <LogOut size={18} />
            {!navCollapsed && "Sign out"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          onClick={() => setDrawerOpen(true)}
          className={`sm:hidden sticky top-0 z-10 flex items-center justify-between px-4 h-16 shrink-0 cursor-pointer ${
            isVendor ? "bg-white border-b border-slate-200 text-slate-900" : "bg-brand-900 text-white"
          }`}
        >
          <span className="w-5.5 shrink-0" />
          {isVendor ? (
            <StoreSwitcher textClassName="font-extrabold tracking-tight text-sm" />
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={110} height={27} priority unoptimized />
          )}
          <button type="button" aria-label="Open menu" className="cursor-pointer shrink-0">
            <Menu size={22} />
          </button>
        </header>

        <MobileNavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Menu"
          footer={
            <button
              type="button"
              onClick={logout}
              disabled={navOffline}
              title={navOffline ? "Unavailable while offline" : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 ${
                navOffline ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <LogOut size={18} />
              Sign out
            </button>
          }
        >
          <NavLinks groups={groups} pathname={pathname} onNavigate={() => setDrawerOpen(false)} offline={navOffline} />
        </MobileNavDrawer>

        <main className="flex-1 bg-slate-100">
          <PullToRefresh>
            <div className="p-4 sm:p-8">{children}</div>
          </PullToRefresh>
        </main>
      </div>
    </div>
  );

  // Every vendor page under here reads/switches the active store through
  // this shared context (see components/VendorStoreContext.js) instead of
  // each independently fetching /api/v1/vendor/stores and defaulting to
  // stores[0] - that's what let the sidebar switcher actually affect every
  // page, not just the one it was clicked on.
  return isVendor ? (
    <VendorStoreProvider token={token} apiFetch={apiFetch}>
      {layout}
    </VendorStoreProvider>
  ) : (
    layout
  );
}
