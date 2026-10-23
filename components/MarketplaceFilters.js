"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Loader2, SlidersHorizontal, X } from "lucide-react";
import { Select } from "@/components/ui/Select.js";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const PRICE_RANGES = [
  { label: "Under ₦5k", min: "", max: "5000" },
  { label: "₦5k – ₦20k", min: "5000", max: "20000" },
  { label: "₦20k – ₦50k", min: "20000", max: "50000" },
  { label: "Over ₦50k", min: "50000", max: "" },
];

const POP = "#ff7a1a";

// Mobile-first marketplace filters: a search bar with a Filters button,
// then a category dropdown. Sort and price live in a sheet
// that slides up on phones (a dialog on desktop). Everything drives the
// URL (q, category, sort, min, max), which the page reads server-side -
// `categories` is a flat list of names across every listed store (see
// lib/marketplace.js's getMarketplaceCategoryNames), matched by name.
export function MarketplaceFilters({ categories = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "newest";
  const min = searchParams.get("min") || "";
  const max = searchParams.get("max") || "";
  const activeCount = (sort !== "newest" ? 1 : 0) + (min || max ? 1 : 0);

  const push = (patch) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() });
          }}
          className="relative flex-1"
        >
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            enterKeyHint="search"
            aria-label="Search the marketplace"
            className="h-12 w-full border-2 border-slate-900 bg-white pl-10 pr-10 text-base outline-none focus:ring-2 focus:ring-brand-500"
          />
          {isPending && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
        </form>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="relative inline-flex h-12 shrink-0 items-center gap-2 border-2 border-slate-900 bg-white px-3 sm:px-4 text-sm font-bold text-slate-900 cursor-pointer hover:bg-slate-50"
        >
          <SlidersHorizontal size={17} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border-2 border-slate-900 text-[11px] font-bold" style={{ backgroundColor: POP }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {categories.length > 0 && (
        <div className="sm:max-w-xs">
          <Select
            options={[{ value: "", label: "All categories" }, ...categories.map((name) => ({ value: name, label: name }))]}
            value={category}
            onChange={(v) => push({ category: v })}
            placeholder="All categories"
          />
        </div>
      )}

      {(min || max || sort !== "newest") && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {sort !== "newest" && (
            <ActiveChip label={SORT_OPTIONS.find((o) => o.value === sort)?.label} onClear={() => push({ sort: "" })} />
          )}
          {(min || max) && (
            <ActiveChip
              label={min && max ? `₦${Number(min).toLocaleString()} – ₦${Number(max).toLocaleString()}` : min ? `Over ₦${Number(min).toLocaleString()}` : `Under ₦${Number(max).toLocaleString()}`}
              onClear={() => push({ min: "", max: "" })}
            />
          )}
        </div>
      )}

      {sheetOpen && (
        <FilterSheet
          sort={sort}
          min={min}
          max={max}
          onClose={() => setSheetOpen(false)}
          onApply={(next) => {
            setSheetOpen(false);
            push({ sort: next.sort === "newest" ? "" : next.sort, min: next.min, max: next.max });
          }}
        />
      )}
    </div>
  );
}

function ActiveChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 border border-slate-900 bg-white py-1 pl-2.5 pr-1 font-semibold text-slate-900">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`} className="p-0.5 cursor-pointer hover:text-red-600">
        <X size={13} />
      </button>
    </span>
  );
}

function FilterSheet({ sort, min, max, onClose, onApply }) {
  const [draft, setDraft] = useState({ sort, min, max });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const choice = (on) =>
    `border-2 border-slate-900 px-3 py-2.5 text-sm font-semibold text-left cursor-pointer ${on ? "text-slate-900" : "bg-white text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="mp-filter-title" className="relative flex max-h-[88dvh] w-full flex-col border-t-4 sm:border-4 border-slate-900 bg-[#fbf6e9] sm:max-w-md">
        <div className="flex items-center justify-between border-b-2 border-slate-900 px-4 py-3">
          <h2 id="mp-filter-title" className="text-base font-bold text-slate-900">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 cursor-pointer"><X size={20} /></button>
        </div>

        <div className="space-y-6 overflow-y-auto overscroll-contain p-4">
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-900">Sort by</p>
            <div className="grid gap-2">
              {SORT_OPTIONS.map((o) => (
                <button key={o.value} type="button" aria-pressed={draft.sort === o.value} onClick={() => setDraft((d) => ({ ...d, sort: o.value }))} className={choice(draft.sort === o.value)} style={draft.sort === o.value ? { backgroundColor: POP } : undefined}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-900">Price</p>
            <div className="grid grid-cols-2 gap-2">
              {PRICE_RANGES.map((r) => {
                const on = draft.min === r.min && draft.max === r.max;
                return (
                  <button key={r.label} type="button" aria-pressed={on} onClick={() => setDraft((d) => (on ? { ...d, min: "", max: "" } : { ...d, min: r.min, max: r.max }))} className={choice(on)} style={on ? { backgroundColor: POP } : undefined}>
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[["min", "Min ₦"], ["max", "Max ₦"]].map(([key, label]) => (
                <label key={key} className="space-y-1">
                  <span className="text-xs font-semibold text-slate-700">{label}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value.replace(/\D/g, "") }))}
                    placeholder="Any"
                    className="h-11 w-full border-2 border-slate-900 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t-2 border-slate-900 p-4">
          <button type="button" onClick={() => setDraft({ sort: "newest", min: "", max: "" })} className="h-12 border-2 border-slate-900 bg-white text-sm font-bold text-slate-900 cursor-pointer">
            Clear all
          </button>
          <button type="button" onClick={() => onApply(draft)} className="h-12 border-2 border-slate-900 bg-slate-900 text-sm font-bold text-white cursor-pointer">
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}
