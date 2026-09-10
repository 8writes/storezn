"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Check, Search } from "lucide-react";

// Custom dropdown, options: [{ value, label }].
// The panel renders in a portal on <body> with fixed positioning, so it
// can't be clipped by an `overflow-x-auto` table wrapper or a card - and
// option labels wrap instead of truncating, so a long branch name is
// fully readable.
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
  hint,
  error,
  // `accent` tints the resting control chrome (border, chevron) with the
  // brand colour - used on the storefront so the filters carry the
  // store's theme even before anything's picked. `active` is the stronger
  // "a filter is applied" state on top of that: brand-600 border + brand
  // text.
  accent = false,
  active = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(null); // { left, top, width, drop } | null
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setPos({
      left: r.left,
      top: r.bottom + 4,
      bottom: window.innerHeight - r.top + 4,
      width: r.width,
      up: below < 300 && r.top > below,
      uiFont: !!el.closest?.(".font-ui"),
    });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
    else if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, searchable]);

  const selected = options.find((o) => o.value === value);
  const visibleOptions =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;

  // Panel goes in a <body> portal (so no table `overflow` can clip it and
  // `position: fixed` is honestly viewport-relative). It inherits Inter
  // when the trigger is inside the dashboard shell (pos.uiFont).
  const panel =
    open && !loading && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: pos.left,
              [pos.up ? "bottom" : "top"]: pos.up ? pos.bottom : pos.top,
              minWidth: pos.width,
            }}
            className={`z-100 w-max max-w-[min(28rem,90vw)] max-h-72 flex flex-col bg-surface border border-slate-200 rounded-sm shadow-lg overflow-hidden ${pos.uiFont ? "font-ui" : ""}`}
          >
            {searchable && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 shrink-0">
                <Search size={14} className="text-slate-400 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full text-sm bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>
            )}
            <div className="overflow-auto py-1">
              {visibleOptions.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No options</div>}
              {visibleOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  title={opt.label}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-start justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-brand-50 cursor-pointer"
                >
                  <span className={`min-w-0 break-words ${opt.value === value ? "text-brand-700 font-medium" : "text-slate-700"}`}>
                    {opt.label}
                  </span>
                  {opt.value === value && <Check size={14} className="text-brand-600 shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex flex-col gap-1" ref={wrapRef}>
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
        {required && (
          <select value={value || ""} onChange={() => {}} required tabIndex={-1} aria-hidden="true" className="absolute w-px h-px opacity-0 pointer-events-none">
            <option value="" />
            {options.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </select>
        )}
        <button
          type="button"
          ref={triggerRef}
          disabled={disabled || loading}
          onClick={() => setOpen((o) => !o)}
          aria-invalid={error ? true : undefined}
          title={selected?.label}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-sm text-base sm:text-sm bg-surface cursor-pointer text-left
            outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2
            disabled:bg-slate-100 disabled:cursor-not-allowed ${
              error
                ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/20"
                : active
                  ? "border-brand-600 focus-visible:ring-brand-500/25"
                  : accent
                    ? "border-brand-500 focus-visible:border-brand-600 focus-visible:ring-brand-500/20"
                    : "border-slate-300 focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
            }`}
        >
          <span
            className={`truncate min-w-0 ${
              active ? "text-brand-700 font-medium" : accent ? "text-brand-700" : selected ? "text-slate-900" : "text-slate-500"
            }`}
          >
            {loading ? "Loading…" : selected ? selected.label : placeholder}
          </span>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-slate-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${active ? "text-brand-600" : accent ? "text-brand-500" : "text-slate-400"}`} />
          )}
        </button>
        {panel}
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
