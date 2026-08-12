"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Check, Search } from "lucide-react";

// Custom dropdown, options: [{ value, label }]
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Select...",
  loading = false,
  disabled = false,
  required = false,
  searchable = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
    } else if (searchable) {
      // Focus after the dropdown actually mounts.
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const selected = options.find((o) => o.value === value);
  const visibleOptions =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        {/* Custom dropdown above isn't a native form control, so `required`
            wouldn't otherwise block submission. This hidden-but-rendered
            native select mirrors the value and lets the browser enforce
            it (display:none elements are excluded from constraint
            validation, so this uses zero-size/opacity instead). */}
        {required && (
          <select
            value={value || ""}
            onChange={() => {}}
            required
            tabIndex={-1}
            aria-hidden="true"
            className="absolute w-px h-px opacity-0 pointer-events-none"
          >
            <option value="" />
            {options.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500 bg-white cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed text-left"
        >
          <span className={selected ? "text-slate-900" : "text-slate-700"}>
            {loading ? "Loading…" : selected ? selected.label : placeholder}
          </span>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-slate-700 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-slate-700 shrink-0" />
          )}
        </button>

        {open && !loading && (
          <div className="absolute z-20 mt-1 w-full max-h-72 flex flex-col bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden">
            {searchable && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 shrink-0">
                <Search size={14} className="text-slate-700 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full text-base outline-none placeholder:text-slate-700"
                />
              </div>
            )}
            <div className="overflow-auto py-1">
              {visibleOptions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-700">No options</div>
              )}
              {visibleOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-brand-50 cursor-pointer"
                >
                  <span className={opt.value === value ? "text-brand-700 font-medium" : "text-slate-700"}>
                    {opt.label}
                  </span>
                  {opt.value === value && <Check size={14} className="text-brand-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
