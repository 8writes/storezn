"use client";
import { useEffect, useState } from "react";
import { Ruler, X } from "lucide-react";

// Opens the vendor's free-text size chart (products.sizeGuide) in a
// simple modal - kept out of the main description so it doesn't bloat the
// buy box, but one tap away for anyone unsure of their size.
export function SizeGuideButton({ text }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
      >
        <Ruler size={14} />
        Size guide
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-sm shadow-xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Size guide</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{text}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
