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
} from "lucide-react";
import Image from "next/image";
import { PullToRefresh } from "@/components/ui/PullToRefresh.js";

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
      title: "Account",
      items: [{ href: "/profile", label: "Profile", icon: User }],
    },
  ],
  vendor: [
    {
      title: "Store",
      items: [
        { href: "/vendor/dashboard", label: "Dashboard", icon: Store },
        { href: "/vendor/products", label: "Products", icon: Package },
        { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
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
        { href: "/vendor/verification", label: "Verification", icon: ShieldCheck },
      ],
    },
    {
      title: "Team",
      items: [{ href: "/vendor/staff", label: "Staff", icon: UserCog }],
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
        { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
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
function NavLinks({ groups, pathname, onNavigate, muted = false }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.title}>
          <p
            className={`px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider first:pt-2 ${
              muted ? "text-slate-400" : "text-white/40"
            }`}
          >
            {group.title}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={
                muted
                  ? `flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                      pathname === href
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  : `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                      pathname === href
                        ? "bg-brand-600 text-white"
                        : "text-white hover:bg-white/10"
                    }`
              }
            >
              <Icon size={18} />
              {label}
              <NavLinkHint />
            </Link>
          ))}
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
        <div className="flex-1 p-4 sm:p-8 space-y-6 bg-slate-50">
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

  const layout = (
    // Sticky sidebar, not a fixed-height internally-scrolled container -
    // see school-app's layout.js for why: nested overflow containers get
    // the 100vh math wrong across embedded webviews/mobile browser chrome
    // and end up dragging the sidebar away as the page scroll.
    <div className="min-h-screen flex">
      <Toaster position="top-right" offset="10vh" closeButton={true} />

      <aside
        className={`hidden sm:flex sm:w-60 shrink-0 flex-col h-dvh sticky top-0 ${
          isVendor ? "bg-white border-r border-slate-200" : "bg-brand-900"
        }`}
      >
        <div className={`flex items-center px-4 h-16 border-b shrink-0 ${isVendor ? "border-slate-200" : "border-slate-800"}`}>
          {isVendor ? (
            <StoreSwitcher textClassName="text-slate-900 font-extrabold tracking-tight text-sm" />
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          <NavLinks groups={groups} pathname={pathname} muted={isVendor} />
        </nav>
        <div className={`border-t shrink-0 ${isVendor ? "border-slate-200" : "border-slate-800"}`}>
          <button
            type="button"
            onClick={logout}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium cursor-pointer ${
              isVendor ? "text-slate-600 hover:bg-slate-50 hover:text-red-600" : "text-white hover:bg-white/10"
            }`}
          >
            <LogOut size={18} />
            Sign out
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
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
            >
              <LogOut size={18} />
              Sign out
            </button>
          }
        >
          <NavLinks groups={groups} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </MobileNavDrawer>

        <main className="flex-1 bg-slate-50">
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
