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

export function StorefrontFilters({ categories }) {
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

  const categoryOptions = [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];
  const activeCategory = !!searchParams.get("category");
  const activeSort = (searchParams.get("sort") || "newest") !== "newest";

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-end pb-4 border-b border-slate-200">
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
          placeholder="Search products..."
          className="w-full pl-1 pr-8 py-2 border-0 border-b border-slate-200 text-base outline-none focus:border-slate-900 transition-colors bg-transparent"
        />
        <button
          type="submit"
          disabled={isPending}
          aria-label="Search"
          className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900 transition-colors disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </form>

      {categories.length > 0 && (
        <div className="w-full sm:w-48">
          <Select
            options={categoryOptions}
            value={searchParams.get("category") || ""}
            onChange={(v) => setParam("category", v)}
            placeholder="All categories"
            active={activeCategory}
          />
        </div>
      )}

      <div className="w-full sm:w-48">
        <Select
          options={SORT_OPTIONS}
          value={searchParams.get("sort") || "newest"}
          onChange={(v) => setParam("sort", v === "newest" ? "" : v)}
          active={activeSort}
        />
      </div>
    </div>
  );
}
