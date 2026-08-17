"use client";
import { useState } from "react";
import { Package, ArrowRight, Loader2 } from "lucide-react";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { formatCurrency } from "@/lib/format.js";

function ProductCard({ product, i }) {
  const effectivePrice = getEffectivePrice(product.price, product.discountPercent);
  // ?from=marketplace is what the storefront banner (see
  // components/storefront/MarketplaceBanner.js) keys off to show the
  // "you're now viewing X's store" notice and a way back here - the
  // marketplace itself never hosts checkout, this link always hands off
  // to the vendor's real storefront to actually buy.
  const href = `${getStorefrontUrl(product.store)}/products/${product.slug}?from=marketplace`;

  return (
    <a
      href={href}
      className={`group relative bg-white border-2 border-slate-900 overflow-hidden transition-transform hover:-translate-y-1 ${
        i % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
      }`}
      style={{ boxShadow: "5px 5px 0 0 #0f1712" }}
    >
      <div className="relative aspect-square bg-slate-100 border-b-2 border-slate-900 overflow-hidden">
        {product.discountPercent > 0 && (
          <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[11px] font-bold px-1.5 py-0.5 border border-slate-900">
            -{product.discountPercent}%
          </span>
        )}
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300 text-xs">No image</span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700 truncate">{product.store.name}</p>
        <p className="mt-0.5 font-semibold text-slate-900 text-sm flex items-center gap-1.5">
          <span className="truncate">{product.name}</span>
          <ArrowRight size={13} className="shrink-0 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
        </p>
        <p className="mt-1.5 font-extrabold text-slate-900">
          {formatCurrency(effectivePrice)}
          {product.discountPercent > 0 && <span className="ml-1.5 text-xs font-medium text-slate-400 line-through">{formatCurrency(product.price)}</span>}
        </p>
      </div>
    </a>
  );
}

// Page 1 is server-rendered (see app/stores/page.js) for first-paint/SEO
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
      <div className="text-center py-16 text-slate-500 bg-white border-2 border-dashed border-slate-300">
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
