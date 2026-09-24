"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

export function ProductFormFieldsButton({ fields, visibleFields, onToggle, saving = false }) {
  const [open, setOpen] = useState(false);
  useModalScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const close = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={15} /> Customize fields
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overflow-y-auto overscroll-contain p-0 sm:p-4 sm:py-8">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col my-auto">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
              <div>
                <h2 className="font-semibold text-slate-900">Product form fields</h2>
                <p className="text-sm text-slate-600 mt-0.5">Your selection is remembered for this store.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fields.map((field) => (
                <label key={field.id} className="flex items-center gap-3 min-h-10 px-3 py-2 border border-slate-200 rounded-sm text-sm text-slate-800 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleFields.includes(field.id)}
                    onChange={() => onToggle(field.id)}
                    disabled={saving}
                    className="size-4 accent-brand-600"
                  />
                  {field.label}
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-200">
              <span className="text-xs text-slate-600">{saving ? "Saving..." : `${visibleFields.length} visible`}</span>
              <Button type="button" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
