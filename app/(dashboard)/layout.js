"use client";
import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { MobileNavDrawer } from "@/components/ui/MobileNavDrawer.js";
import { Skeleton } from "@/components/ui/Skeleton.js";
import { Menu, LogOut, Store, Settings, BarChart3, Package, ShoppingBag, User, Users, Truck, ShieldCheck, Wallet } from "lucide-react";
import Image from "next/image";

const NAV_BY_ROLE = {
  super_admin: [
    { href: "/super-admin/analytics", label: "Overview", icon: BarChart3 },
    { href: "/super-admin/stores", label: "Stores", icon: Store },
    { href: "/super-admin/vendors", label: "Vendors", icon: ShieldCheck },
    { href: "/super-admin/products", label: "Products", icon: Package },
    { href: "/super-admin/orders", label: "Orders", icon: ShoppingBag },
    { href: "/super-admin/customers", label: "Customers", icon: Users },
    { href: "/super-admin/settings", label: "Platform settings", icon: Settings },
    { href: "/profile", label: "Profile", icon: User },
  ],
  vendor: [
    { href: "/vendor/dashboard", label: "Dashboard", icon: Store },
    { href: "/vendor/products", label: "Products", icon: Package },
    { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
    { href: "/vendor/payouts", label: "Payouts", icon: Wallet },
    { href: "/vendor/customers", label: "Customers", icon: Users },
    { href: "/vendor/shipping", label: "Shipping", icon: Truck },
    { href: "/vendor/settings", label: "Store settings", icon: Settings },
    { href: "/vendor/verification", label: "Verification", icon: ShieldCheck },
    { href: "/profile", label: "Profile", icon: User },
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

function NavLinks({ links, pathname, onNavigate }) {
  return (
    <>
      {links.map(({ href, label, icon: Icon }) => (
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
    </>
  );
}

export default function DashboardLayout({ children }) {
  const { user, token, loading, logout } = useAuth(true);
  const { apiFetch } = useApi(token);
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeName, setStoreName] = useState(null);

  useEffect(() => {
    if (!token || user?.role !== "vendor") return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => setStoreName(data.stores?.[0]?.name || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

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

  const links = NAV_BY_ROLE[user.role] || [];
  const isVendorWithStore = user.role === "vendor" && !!storeName;
  const brandLabel = isVendorWithStore ? storeName : "Storezn";

  return (
    // Sticky sidebar, not a fixed-height internally-scrolled container -
    // see school-app's layout.js for why: nested overflow containers get
    // the 100vh math wrong across embedded webviews/mobile browser chrome
    // and end up dragging the sidebar away as the page scroll.
    <div className="min-h-screen flex">
      <Toaster position="top-right" offset="10vh" closeButton={true} />

      <aside className="hidden sm:flex sm:w-60 shrink-0 flex-col bg-brand-900 h-dvh sticky top-0">
        <div className="flex items-center px-4 h-16 border-b border-slate-800 shrink-0">
          {isVendorWithStore ? (
            <span className="text-white font-extrabold tracking-tight text-sm truncate">{brandLabel}</span>
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          <NavLinks links={links} pathname={pathname} />
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
        <header className="sm:hidden sticky top-0 z-10 flex items-center justify-between px-4 h-16 bg-brand-900 text-white shrink-0">
          <span className="w-5.5" />
          {isVendorWithStore ? (
            <span className="font-extrabold tracking-tight text-sm truncate max-w-[60%]">{brandLabel}</span>
          ) : (
            <Image src="/storezn-logo.png" alt="Storezn" width={110} height={27} priority unoptimized />
          )}
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="cursor-pointer">
            <Menu size={22} />
          </button>
        </header>

        <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu">
          <NavLinks links={links} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </MobileNavDrawer>

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
