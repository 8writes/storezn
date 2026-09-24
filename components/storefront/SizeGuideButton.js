"use client";
import { useEffect, useState } from "react";
import { Ruler, X } from "lucide-react";
import { SizeGuideTable } from "@/components/ui/SizeGuideTable.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

// Opens the product's structured size chart (products.sizeGuide) in a
// modal - a real measurements table with a cm/inch toggle, kept out of
// the buy box but one tap away for anyone unsure of their size.
export function SizeGuideButton({ guide }) {
  const [open, setOpen] = useState(false);
  useModalScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!guide?.columns?.length || !guide?.rows?.length) return null;

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
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-4 py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-sm shadow-xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Size guide</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-800 hover:text-slate-900 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 max-h-[75vh] overflow-y-auto overscroll-contain">
              <SizeGuideTable guide={guide} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
