"use client";
import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select.js";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

// Same URL-params-drive-the-query shape as the per-store storefront's
// StorefrontFilters - no category filter here though, since categories
// are per-store (categories.storeId) and don't have a marketplace-wide
// equivalent yet.
export function MarketplaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [isPending, startTransition] = useTransition();

  const setParam = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q);
        }}
        className="flex-1 relative"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the marketplace..."
          className="w-full pl-4 pr-10 py-2.5 border-2 border-slate-900 text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        <button
          type="submit"
          disabled={isPending}
          aria-label="Search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900 transition-colors disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </form>

      <div className="w-full sm:w-52">
        <Select options={SORT_OPTIONS} value={searchParams.get("sort") || "newest"} onChange={(v) => setParam("sort", v === "newest" ? "" : v)} />
      </div>
    </div>
  );
}
