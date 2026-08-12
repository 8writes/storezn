"use client";
import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { MobileNavDrawer } from "@/components/ui/MobileNavDrawer.js";
import { StoreSwitcher } from "@/components/ui/StoreSwitcher.js";
import { VendorStoreProvider } from "@/components/VendorStoreContext.js";
import { Skeleton } from "@/components/ui/Skeleton.js";
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
} from "lucide-react";
import Image from "next/image";

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
      items: [{ href: "/super-admin/settings", label: "Platform settings", icon: Settings }],
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
      items: [{ href: "/vendor/payouts", label: "Payouts", icon: Wallet }],
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

function NavLinks({ groups, pathname, onNavigate }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-4 pt-4 pb-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider first:pt-2">
            {group.title}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-brand-600 text-white"
                  : "text-white hover:bg-white/10"
              }`}
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  const isVendor = user.role === "vendor";

  const layout = (
    // Sticky sidebar, not a fixed-height internally-scrolled container -
    // see school-app's layout.js for why: nested overflow containers get
    // the 100vh math wrong across embedded webviews/mobile browser chrome
    // and end up dragging the sidebar away as the page scroll.
    <div className="min-h-screen flex">
      <Toaster position="top-right" offset="10vh" closeButton={true} />

      <aside className="hidden sm:flex sm:w-60 shrink-0 flex-col bg-brand-900 h-dvh sticky top-0">
        <div className="flex items-center px-4 h-16 border-b border-slate-800 shrink-0">
          {isVendor ? (
            <StoreSwitcher textClassName="text-white font-extrabold tracking-tight text-sm" />
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          <NavLinks groups={groups} pathname={pathname} />
        </nav>
        <div className="border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          onClick={() => setDrawerOpen(true)}
          className="sm:hidden sticky top-0 z-10 flex items-center justify-between px-4 h-16 bg-brand-900 text-white shrink-0 cursor-pointer"
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

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">{children}</main>
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
