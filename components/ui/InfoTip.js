"use client";
import { useState } from "react";
import { Info } from "lucide-react";

// Small hover/tap-triggered explanation, for the "nice to know but not
// essential" copy that used to sit as a permanent paragraph under every
// field - reads fine in a form full of similar paragraphs, but stacked
// across a whole page it's what turns a form into a wall of text nobody
// actually reads. Keeps the same words reachable on demand instead of
// deleting them.
export function InfoTip({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="More info"
        className="text-slate-300 hover:text-slate-500 cursor-pointer"
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-sm bg-slate-800 text-white text-xs leading-relaxed px-3 py-2 shadow-lg"
        >
          {children}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
}
