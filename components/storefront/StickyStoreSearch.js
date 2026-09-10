"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

// A second search field that slides in under the sticky header once the
// shopper has scrolled past the first one, so they can search again from
// anywhere down a long product list without scrolling back up. Hidden at
// the top of the page (the in-page StorefrontFilters search is right
// there) and while actually on a search results view is fine - it just
// pre-fills with the active query.
export function StickyStoreSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const dirty = useRef(false);

  // Keep in sync with the URL query until the shopper starts typing.
  useEffect(() => {
    if (!dirty.current) setQ(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    dirty.current = false;
    router.push(term ? `/?q=${encodeURIComponent(term)}` : "/");
    inputRef.current?.blur();
  };

  return (
    <div
      className={`fixed inset-x-0 top-20 z-20 transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <div className="bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <form onSubmit={submit} className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => {
              dirty.current = true;
              setQ(e.target.value);
            }}
            placeholder="Search products..."
            aria-label="Search products"
            tabIndex={visible ? 0 : -1}
            className="flex-1 min-w-0 bg-transparent text-base outline-none text-slate-900 placeholder:text-slate-400"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                dirty.current = true;
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800 transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
