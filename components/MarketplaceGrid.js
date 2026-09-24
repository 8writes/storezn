"use client";
import { useState } from "react";
import { Package, Loader2, MapPin } from "lucide-react";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { formatCurrency } from "@/lib/format.js";
import { formatStateLabel } from "@/lib/nigeria.js";

// Deliberately plainer than the rest of the marketplace's maximalist
// sticker-and-shadow chrome (see app/marketplace/page.js) - a whole grid
// of thick borders and offset shadows gets noisy fast, so the cards
// themselves stay minimal (just the photo and the essentials) and let
// the product photos carry the visual weight instead.
function ProductCard({ product }) {
  const effectivePrice = getEffectivePrice(product.price, product.discountPercent);
  const invoiceRequired = product.saleMode === "invoice_required";
  // ?from=marketplace is what MarketplaceBanner.js keys off to show the
  // "you're now on X's store" dialog on arrival - the marketplace itself
  // never hosts checkout, this link always hands off to the vendor's
  // real storefront to actually buy.
  const href = `${getStorefrontUrl(product.store)}/products/${product.slug}?from=marketplace`;

  return (
    <a href={href} className="group block">
      <div className="relative aspect-4/5 bg-slate-100 overflow-hidden">
        {!invoiceRequired && product.discountPercent > 0 && (
          <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-sm">
            -{product.discountPercent}%
          </span>
        )}
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300 text-xs">No image</span>
        )}
      </div>
      <div className="mt-2.5 space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 truncate">{product.store.name}</p>
        <p className="text-sm text-slate-800 group-hover:text-slate-950 transition-colors line-clamp-2">{product.name}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-slate-900">{invoiceRequired ? "Price on request" : formatCurrency(effectivePrice)}</span>
          {!invoiceRequired && product.discountPercent > 0 && <span className="text-xs text-slate-400 line-through">{formatCurrency(product.price)}</span>}
        </p>
        {product.store.state && (
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin size={11} className="shrink-0" />
            {formatStateLabel(product.store.state)}
          </p>
        )}
      </div>
    </a>
  );
}

// Page 1 is server-rendered (see app/marketplace/page.js) for first-paint/SEO
// - this takes over for "Load more", fetching subsequent pages from
// /api/v1/public/marketplace with the same filters and appending rather
// than navigating. Remounted (via the `key` the page passes) whenever a
// filter changes, so stale appended pages from a previous search never
// linger.
export function MarketplaceGrid({ initialProducts, total, filters }) {
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ ...filters, page: String(page + 1) });
      const res = await fetch(`/api/v1/public/marketplace?${params}`);
      const data = await res.json();
      setItems((s) => [...s, ...(data.products || [])]);
      setPage((p) => p + 1);
    } catch {
      // best-effort - the button just stays clickable to retry
    } finally {
      setLoadingMore(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-slate-800 bg-white border-2 border-dashed border-slate-300">
        <Package size={28} className="mx-auto mb-3" />
        <p className="font-medium">No products match{filters.q ? " your search" : " yet"}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {items.map((product, i) => (
          <ProductCard key={product.id} product={product} i={i} />
        ))}
      </div>

      {items.length < total && (
        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-900 font-bold text-slate-900 hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer"
            style={{ boxShadow: "3px 3px 0 0 #0f1712" }}
          >
            {loadingMore && <Loader2 size={16} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </>
  );
}
