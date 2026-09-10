"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";

function RailCard({ p }) {
  const effectivePrice = getEffectivePrice(p.price, p.discountPercent);
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group block shrink-0 w-40 sm:w-48 snap-start"
    >
      <div className="relative aspect-4/5 bg-slate-100 overflow-hidden rounded-sm">
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
      <div className="mt-2 space-y-0.5">
        <p className="text-sm text-slate-800 group-hover:text-slate-950 transition-colors truncate">{p.name}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-slate-900">{formatCurrency(effectivePrice)}</span>
          {p.discountPercent > 0 && <span className="text-xs text-slate-400 line-through">{formatCurrency(p.price)}</span>}
        </p>
      </div>
    </Link>
  );
}

// Horizontal scroll-snap rail with prev/next arrows. Arrows only show on
// pointer devices wide enough to hover (a phone just swipes) and hide
// themselves at each end of the track.
export function ProductRail({ title, products }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => {
    sync();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [products.length]);

  const nudge = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 240), behavior: "smooth" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => nudge(-1)}
            disabled={atStart}
            aria-label={`Scroll ${title} left`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            disabled={atEnd}
            aria-label={`Scroll ${title} right`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <RailCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
