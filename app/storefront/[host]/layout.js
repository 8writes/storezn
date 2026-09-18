import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { resolveStoreByHost, isStoreLive } from "@/lib/resolveStore.js";
import { getStorefrontUrl, getPlatformUrl } from "@/lib/storeUrl.js";
import { CartBadge } from "@/components/storefront/CartBadge.js";
import { AccountMenu } from "@/components/storefront/AccountMenu.js";
import { Footer } from "@/components/storefront/Footer.js";
import { WhatsAppButton } from "@/components/storefront/WhatsAppButton.js";
import { StoreOfflineNotice } from "@/components/storefront/StoreOfflineNotice.js";
import { MarketplaceBanner } from "@/components/storefront/MarketplaceBanner.js";
import UpdatePrompt from "@/app/UpdatePrompt.js";
import { isPlusStore } from "@/lib/storePlan.js";
import { generateBrandShades } from "@/lib/colorShades.js";

// Uses the vendor's own uploaded logo as the browser tab icon on their
// storefront (falls back to the platform default when they haven't set
// one) - resolved separately from the page body since generateMetadata
// runs before render and gets its own store lookup.
//
// Also sets Open Graph/Twitter card data so sharing a store's link (the
// exact URL from CopyableUrl.js on the vendor dashboard) shows a real
// preview - name, a short description, and the store's logo - instead of
// a bare link, wherever it's pasted (WhatsApp, Instagram bio, Twitter/X).
export async function generateMetadata({ params }) {
  const { host } = await params;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store || !isStoreLive(store)) return {};

  const description = store.description || `Shop ${store.name} online - browse products and order directly, powered by Storezn.`;
  // logoUrl is already an absolute Cloudinary URL once a vendor uploads
  // one (see lib/storage/index.js); og:image needs an absolute URL either
  // way, so the platform default is built out to one too rather than
  // left as a bare "/storezn-logo.png" path.
  const image = store.logoUrl || getPlatformUrl("/storezn-logo.png");

  return {
    title: store.name,
    description,
    icons: store.faviconUrl ? { icon: store.faviconUrl } : undefined,
    openGraph: {
      title: store.name,
      description,
      url: getStorefrontUrl(store),
      siteName: store.name,
      images: [{ url: image }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: store.name,
      description,
      images: [image],
    },
  };
}

// Resolves the store once per request and renders the shared storefront
// chrome (header) - the page components underneath just fetch products.
export default async function StorefrontLayout({ children, params }) {
  const { host } = await params;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return notFound();
  if (!isStoreLive(store)) return <StoreOfflineNotice store={store} />;

  // Storezn+ only - a free store's accent color (if any stale value is
  // present from a lapsed subscription) is ignored, the storefront just
  // renders the platform default brand-* ramp already in globals.css.
  const themed = isPlusStore(store) && !!store.storefrontAccentColor;
  const accentStyle = themed ? generateBrandShades(store.storefrontAccentColor) : undefined;

  return (
    <div className="min-h-screen bg-white flex flex-col" style={accentStyle} data-cookie-site-name={store.name}>
      <Suspense fallback={null}>
        <MarketplaceBanner storeName={store.name} />
      </Suspense>
      <header
        className={
          themed
            ? "bg-brand-600 sticky top-0 z-40"
            : "bg-white/90 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40"
        }
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="h-10 max-w-40 object-contain" />
            ) : (
              <>
                <span
                  className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0 ${
                    themed ? "bg-white text-brand-700" : "bg-slate-900 text-white"
                  }`}
                >
                  {store.name.slice(0, 1).toUpperCase()}
                </span>
                <span className={`font-semibold tracking-tight text-lg truncate ${themed ? "text-white" : "text-slate-900"}`}>{store.name}</span>
              </>
            )}
          </Link>
          <div className={`flex items-center gap-6 ${themed ? "text-white" : "text-slate-700"}`}>
            <AccountMenu />
            <CartBadge />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex-1 w-full">{children}</main>
      <Footer store={store} themed={themed} />
      <WhatsAppButton store={store} />
      <UpdatePrompt />
      {/* top-center, not top-right - the cart icon lives in that corner
          of the sticky header (see CartBadge above), and a toast stacking
          there would sit right on top of it. offset clears the header's
          fixed 80px height (h-20) rather than a viewport-relative unit,
          which could land short of it on a short screen. mobileOffset is
          taller than offset since the header's px-4 gutter is narrower
          there, so a toast sitting right at the edge of the nav reads as
          cramped in a way it doesn't on desktop's wider header. */}
      <Toaster position="top-center" offset="90px" mobileOffset="120px" closeButton={true} />
    </div>
  );
}
