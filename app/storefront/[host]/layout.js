import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveStoreByHost, isStoreLive } from "@/lib/resolveStore.js";
import { CartBadge } from "@/components/storefront/CartBadge.js";
import { AccountMenu } from "@/components/storefront/AccountMenu.js";
import { Footer } from "@/components/storefront/Footer.js";
import { WhatsAppButton } from "@/components/storefront/WhatsAppButton.js";

// Uses the vendor's own uploaded logo as the browser tab icon on their
// storefront (falls back to the platform default when they haven't set
// one) - resolved separately from the page body since generateMetadata
// runs before render and gets its own store lookup.
export async function generateMetadata({ params }) {
  const { host } = await params;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store || !isStoreLive(store)) return {};
  return {
    title: store.name,
    icons: store.faviconUrl ? { icon: store.faviconUrl } : undefined,
  };
}

// Resolves the store once per request and renders the shared storefront
// chrome (header) - the page components underneath just fetch products.
export default async function StorefrontLayout({ children, params }) {
  const { host } = await params;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store || !isStoreLive(store)) return notFound();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="h-10 max-w-40 object-contain" />
            ) : (
              <>
                <span className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-bold shrink-0">
                  {store.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-semibold tracking-tight text-lg text-slate-900 truncate">{store.name}</span>
              </>
            )}
          </Link>
          <div className="flex items-center gap-6 text-slate-700">
            <AccountMenu />
            <CartBadge />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex-1 w-full">{children}</main>
      <Footer store={store} />
      <WhatsAppButton store={store} />
    </div>
  );
}
