"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useVendorStore, MAX_STORES_PER_VENDOR } from "@/components/VendorStoreContext.js";
import { AddStoreModal } from "@/components/ui/AddStoreModal.js";
import { useApi } from "@/hooks/useApi.js";

// Sits where the sidebar's static brand name/logo used to be (see
// (dashboard)/layout.js) - a vendor with more than one store needs this
// reachable from every page, not just the dashboard, since switching here
// is what every other page's data (products/orders/payouts/...) now
// follows (see VendorStoreContext).
export function StoreSwitcher({ token, textClassName }) {
  const { stores, storeId, setStoreId, reload } = useVendorStore();
  const { apiFetch } = useApi(token);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = stores.find((s) => s.id === storeId);
  if (!current) return null;

  return (
    // Mounted inside the mobile header, which itself opens the nav drawer
    // on any click (see (dashboard)/layout.js) - stops that click from
    // also reaching the header while someone's actually using the
    // switcher/its dropdown/its "Add store" modal.
    <div className="relative flex-1 min-w-0" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 min-w-0 w-full cursor-pointer"
      >
        <span className={`truncate ${textClassName}`}>{current.name}</span>
        <ChevronDown size={14} className="text-white/60 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStoreId(s.id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 cursor-pointer"
              >
                <span className={`truncate ${s.id === storeId ? "text-brand-700 font-medium" : "text-slate-700"}`}>{s.name}</span>
                {s.id === storeId && <Check size={14} className="text-brand-600 shrink-0" />}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100">
            {stores.length < MAX_STORES_PER_VENDOR ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setAddOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50 cursor-pointer"
              >
                <Plus size={14} />
                Add store
              </button>
            ) : (
              <p className="px-3 py-2.5 text-xs text-slate-400">You&apos;ve reached the {MAX_STORES_PER_VENDOR}-store limit</p>
            )}
          </div>
        </div>
      )}

      {addOpen && (
        <AddStoreModal
          onClose={() => setAddOpen(false)}
          apiFetch={apiFetch}
          onCreated={(store) => {
            setAddOpen(false);
            reload();
            setStoreId(store.id);
          }}
        />
      )}
    </div>
  );
}
