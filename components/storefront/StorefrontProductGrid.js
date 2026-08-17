"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { formatCurrency, formatCondition } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";

function ProductCard({ p, storeState }) {
  const effectivePrice = getEffectivePrice(p.price, p.discountPercent);
  return (
    <Link href={`/products/${p.slug}`} className="group block">
      <div className="relative aspect-4/5 bg-slate-100 overflow-hidden">
        {p.discountPercent > 0 && !p.outOfStock && (
          <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-sm">
            -{p.discountPercent}%
          </span>
        )}
        {p.outOfStock && (
          <span className="absolute top-2 left-2 z-10 bg-slate-900/80 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-sm">
            Out of stock
          </span>
        )}
        {p.images?.[0] ? (
          <img
            src={p.images[0]}
            alt={p.name}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${p.outOfStock ? "opacity-50" : ""}`}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300 text-xs">No image</span>
        )}
      </div>
      <div className="mt-3 space-y-0.5">
        <p className="text-sm text-slate-800 group-hover:text-slate-950 transition-colors">
          {p.name}
          {p.productType === "physical" && p.condition !== "new" && (
            <span className="ml-1.5 text-xs text-slate-700 uppercase tracking-wide">{formatCondition(p.condition)}</span>
          )}
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-slate-900">{formatCurrency(effectivePrice)}</span>
          {p.discountPercent > 0 && <span className="text-xs text-slate-400 line-through">{formatCurrency(p.price)}</span>}
        </p>
        {storeState && (
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin size={11} className="shrink-0" />
            {storeState}
          </p>
        )}
      </div>
    </Link>
  );
}

// Page 1 is server-rendered (see app/storefront/[host]/page.js) for
// first-paint/SEO - this takes over for "Load more", fetching subsequent
// pages from /api/v1/storefront/products with the same filters and
// appending rather than navigating. Remounted (via the `key` the page
// passes) whenever a filter changes, so stale appended pages from a
// previous search/filter never linger.
export function StorefrontProductGrid({ initialProducts, total, filters, storeState }) {
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ ...filters, page: String(page + 1) });
      const res = await fetch(`/api/v1/storefront/products?${params}`);
      const data = await res.json();
      setItems((s) => [...s, ...(data.products || [])]);
      setPage((p) => p + 1);
    } catch {
      // best-effort - the button just stays clickable to retry
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} storeState={storeState} />
      ))}

      {items.length < total && (
        <div className="col-span-full flex justify-center pt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-slate-300 rounded-sm text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loadingMore && <Loader2 size={16} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
