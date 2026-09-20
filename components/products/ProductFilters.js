"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A-Z" },
  { value: "price_high", label: "Price: high to low" },
  { value: "price_low", label: "Price: low to high" },
];
export const SORT_LABEL = Object.fromEntries(SORT_OPTIONS.map((option) => [option.value, option.label]));
export const STOCK_OPTIONS = [
  { value: "", label: "Any stock" },
  { value: "in", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "oversold", label: "Oversold" },
];
export const STOCK_LABEL = Object.fromEntries(STOCK_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]));
export const EXPIRY_OPTIONS = [
  { value: "", label: "Any date" },
  { value: "soon", label: "Expiring within 30 days" },
  { value: "expired", label: "Already expired" },
];
export const EXPIRY_LABEL = Object.fromEntries(EXPIRY_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]));
export const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Live" },
  { value: "archived", label: "Archived" },
];
export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]));
export const FEATURED_OPTIONS = [
  { value: "", label: "Any" },
  { value: "yes", label: "Featured" },
  { value: "no", label: "Not featured" },
];
export const FEATURED_LABEL = { yes: "Featured", no: "Not featured" };

export function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 py-0.5 pl-2 pr-1 text-slate-700">
      {label}
      <button type="button" onClick={onClear} className="cursor-pointer text-slate-400 hover:text-slate-700" aria-label={`Clear ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

export function ProductFiltersModal({ categories, categoryId, setCategoryId, sort, setSort, stockLevel, setStockLevel, expiry, setExpiry, status, setStatus, featured, setFeatured, branches = [], branchId = "", setBranchId, allowAllBranches = true, onClose }) {
  const anyActive = categoryId || sort !== "newest" || stockLevel || expiry || status || featured;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-lg sm:rounded-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">Filters</p>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700" aria-label="Close filters">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2">
          {branches.length > 0 && setBranchId && (
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs font-semibold text-slate-700">Stock branch</p>
              <Select options={[...(allowAllBranches ? [{ value: "", label: "All branches (store total)" }] : []), ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} value={branchId} onChange={setBranchId} />
            </div>
          )}
          <SegmentFilter label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          <SegmentFilter label="Featured" options={FEATURED_OPTIONS} value={featured} onChange={setFeatured} />
          <SegmentFilter label="Stock level" options={STOCK_OPTIONS} value={stockLevel} onChange={setStockLevel} wide />
          <SegmentFilter label="Expiry" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} wide />

          {categories.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
              <Select options={[{ value: "", label: "All categories" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} value={categoryId} onChange={setCategoryId} />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</p>
            <Select options={SORT_OPTIONS} value={sort} onChange={setSort} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" disabled={!anyActive} onClick={() => { setCategoryId(""); setSort("newest"); setStockLevel(""); setExpiry(""); setStatus(""); setFeatured(""); }} className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40">
            Clear all
          </button>
          <Button type="button" onClick={onClose} className="ml-auto" size="sm">Done</Button>
        </div>
      </div>
    </div>
  );
}

function SegmentFilter({ label, options, value, onChange, wide = false }) {
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className={`grid gap-1.5 ${options.length > 3 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3"}`}>
        {options.map((option) => (
          <button key={option.value || "any"} type="button" onClick={() => onChange(option.value)} className={`cursor-pointer rounded-sm border px-2 py-1.5 text-xs font-medium transition-colors ${value === option.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
