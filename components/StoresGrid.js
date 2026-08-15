"use client";
import { useState } from "react";
import { Anton } from "next/font/google";
import { Store as StoreIcon, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

const anton = Anton({ subsets: ["latin"], weight: "400" });
const POP = "#ff7a1a";

function StoreCard({ store, i }) {
  return (
    <a
      href={getStorefrontUrl(store)}
      target="_blank"
      rel="noreferrer"
      className={`group relative bg-white border-2 border-slate-900 overflow-hidden transition-transform hover:-translate-y-1 ${
        i % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
      }`}
      style={{ boxShadow: "5px 5px 0 0 #0f1712" }}
    >
      <div className="h-28 flex items-center justify-center border-b-2 border-slate-900 px-6 bg-brand-50">
        {store.logoUrl ? (
          <img src={store.logoUrl} alt={store.name} className="max-h-14 max-w-full object-contain" />
        ) : (
          <span
            className={`${anton.className} flex items-center justify-center h-12 w-12 rounded-full text-white text-xl border-2 border-slate-900`}
            style={{ backgroundColor: POP }}
          >
            {store.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-5">
        <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
          {store.name}
          <ArrowRight size={14} className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
        </p>
        {store.description ? (
          <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{store.description}</p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">Visit this store</p>
        )}
        {store.address && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={12} className="shrink-0" />
            <span className="line-clamp-1">{store.address}</span>
          </p>
        )}
      </div>
    </a>
  );
}

// Page 1 is server-rendered (see app/stores/page.js) for first-paint/SEO -
// this only takes over for "Load more", fetching subsequent pages from
// /api/v1/public/stores and appending rather than navigating.
export function StoresGrid({ initialStores, total }) {
  const [stores, setStores] = useState(initialStores);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/v1/public/stores?page=${page + 1}`);
      const data = await res.json();
      setStores((s) => [...s, ...(data.stores || [])]);
      setPage((p) => p + 1);
    } catch {
      // best-effort - the button just stays clickable to retry
    } finally {
      setLoadingMore(false);
    }
  };

  if (stores.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 bg-white border-2 border-dashed border-slate-300">
        <StoreIcon size={28} className="mx-auto mb-3" />
        <p className="font-medium">No stores to show yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store, i) => (
          <StoreCard key={store.id} store={store} i={i} />
        ))}
      </div>

      {stores.length < total && (
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
