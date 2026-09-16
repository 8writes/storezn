"use client";
import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Loader2, X, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui/Select.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Button } from "@/components/ui/Button.js";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
const SORT_LABEL = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label]));

export function StorefrontFilters({ categories, themed = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const push = (params) => {
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const setParam = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    push(params);
  };

  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "newest";
  const min = searchParams.get("min") || "";
  const max = searchParams.get("max") || "";
  const discounted = searchParams.get("discounted") === "1";

  const activeCount =
    (category ? 1 : 0) + (sort !== "newest" ? 1 : 0) + (min ? 1 : 0) + (max ? 1 : 0) + (discounted ? 1 : 0);

  const categoryName = categories.find((c) => c.id === category)?.name;

  const applyModal = (next) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(next)) {
      if (val && !(key === "sort" && val === "newest")) params.set(key, val);
      else params.delete(key);
    }
    push(params);
    setModalOpen(false);
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ["category", "sort", "min", "max", "discounted"]) params.delete(k);
    push(params);
  };

  return (
    <div className="pb-4 border-b border-slate-200 space-y-3">
      <div className="flex items-center gap-2">
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
            className="w-full pl-1 pr-14 py-2 border-0 border-b border-slate-200 text-base outline-none focus:border-brand-500 transition-colors bg-transparent"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setParam("q", "");
              }}
              aria-label="Clear search"
              className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            aria-label="Search"
            className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-600 hover:text-brand-700 transition-colors disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`relative inline-flex items-center gap-1.5 shrink-0 px-3 py-2 border rounded-sm text-sm font-medium cursor-pointer transition-colors text-brand-700 hover:bg-brand-50 ${
            activeCount > 0 ? "border-brand-600 bg-brand-50" : "border-brand-300"
          }`}
        >
          <SlidersHorizontal size={15} />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-brand-600 text-white text-xs font-bold inline-flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {discounted && <Chip label="On sale" onClear={() => setParam("discounted", "")} />}
          {categoryName && <Chip label={categoryName} onClear={() => setParam("category", "")} />}
          {(min || max) && (
            <Chip
              label={`${min ? `₦${Number(min).toLocaleString("en-NG")}` : "₦0"} – ${max ? `₦${Number(max).toLocaleString("en-NG")}` : "any"}`}
              onClear={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("min");
                params.delete("max");
                push(params);
              }}
            />
          )}
          {sort !== "newest" && <Chip label={SORT_LABEL[sort]} onClear={() => setParam("sort", "")} />}
          <button type="button" onClick={clearAll} className="text-slate-800 hover:text-slate-800 underline cursor-pointer">
            Clear all
          </button>
        </div>
      )}

      {modalOpen && (
        <FilterModal
          categories={categories}
          themed={themed}
          initial={{ category, sort, min, max, discounted }}
          onApply={applyModal}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
      {label}
      <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label={`Clear ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

// Bottom sheet on phones, centred card on desktop - capped at 85vh with
// its own scrolling body. Holds its own draft state; nothing touches the
// URL until "Apply".
function FilterModal({ categories, themed, initial, onApply, onClose }) {
  const [category, setCategory] = useState(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);
  const [discounted, setDiscounted] = useState(initial.discounted);

  const reset = () => {
    setCategory("");
    setSort("newest");
    setMin("");
    setMax("");
    setDiscounted(false);
  };
  const anyDraft = category || sort !== "newest" || min || max || discounted;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-sm sm:rounded-sm shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <p className="text-sm font-bold text-slate-900">Filter</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <button
            type="button"
            onClick={() => setDiscounted((d) => !d)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm border text-sm font-medium cursor-pointer transition-colors ${
              discounted ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:border-slate-300"
            }`}
          >
            On sale only
            <span
              className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${discounted ? "bg-brand-600" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${discounted ? "translate-x-4" : ""}`}
              />
            </span>
          </button>

          {categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Category</p>
              <Select
                options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                value={category}
                onChange={setCategory}
                accent={themed}
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Price range (₦)</p>
            <div className="flex items-center gap-2">
              <PriceInput value={min} onChange={setMin} placeholder="Min" />
              <span className="text-slate-400">–</span>
              <PriceInput value={max} onChange={setMax} placeholder="Max" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Sort by</p>
            <div className="grid grid-cols-1 gap-2">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSort(o.value)}
                  className={`px-3 py-2 rounded-sm border text-sm font-medium cursor-pointer transition-colors text-left ${
                    sort === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            disabled={!anyDraft}
            onClick={reset}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Clear all
          </button>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={() => onApply({ category, sort, min, max, discounted: discounted ? "1" : "" })}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
