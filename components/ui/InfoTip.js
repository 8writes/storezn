"use client";
import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// Small hover/tap-triggered explanation, for the "nice to know but not
// essential" copy that used to sit as a permanent paragraph under every
// field - reads fine in a form full of similar paragraphs, but stacked
// across a whole page it's what turns a form into a wall of text nobody
// actually reads. Keeps the same words reachable on demand instead of
// deleting them.
export function InfoTip({ children }) {
  const [open, setOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const anchorRef = useRef(null);
  const tooltipRef = useRef(null);

  // Tooltip is centered on the icon by default (see the className below),
  // which clips off-screen for any icon near the left/right edge -
  // mobile forms are narrow enough that this was common, not an edge
  // case. Measured and corrected on open rather than guessed in CSS,
  // since the icon's position varies per field/screen size.
  useEffect(() => {
    if (!open || !anchorRef.current || !tooltipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const width = tooltipRef.current.offsetWidth;
    const margin = 8;
    const idealLeft = anchor.left + anchor.width / 2 - width / 2;
    const clampedLeft = Math.min(Math.max(idealLeft, margin), window.innerWidth - width - margin);
    setShiftX(clampedLeft - idealLeft);
  }, [open]);

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="More info"
        className="p-1 -m-1 text-slate-400 hover:text-brand-600 cursor-pointer"
      >
        <Info size={16} />
      </button>
      {open && (
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
          className="absolute z-20 bottom-full left-1/2 mb-2 w-56 max-w-[80vw] rounded-sm bg-slate-800 text-white text-xs leading-relaxed px-3 py-2 shadow-lg"
        >
          {children}
        </span>
      )}
      {open && (
        <span className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-0.5 border-4 border-transparent border-t-slate-800" />
      )}
    </span>
  );
}
