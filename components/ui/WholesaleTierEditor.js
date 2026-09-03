"use client";
import { Plus, X } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip.js";

// Quantity price breaks. value is [{ minQty, unitPrice }] (or null).
// Emits null when there are no rows so the field clears cleanly.
export function WholesaleTierEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : [];

  const emit = (next) => onChange(next.length ? next : null);
  const setRow = (i, patch) => emit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => emit([...rows, { minQty: "", unitPrice: "" }]);
  const remove = (i) => emit(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700">Wholesale / bulk pricing</label>
        <InfoTip>
          Charge less per unit when someone buys more. e.g. &quot;5 or more → ₦900 each&quot;. Applies at checkout and on the
          register; the highest matching tier wins. Leave empty for one flat price.
        </InfoTip>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 shrink-0">Buy</span>
              <input
                type="number"
                min="2"
                inputMode="numeric"
                value={r.minQty}
                onChange={(e) => setRow(i, { minQty: e.target.value })}
                placeholder="5"
                className="w-16 px-2 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
              />
              <span className="text-xs text-slate-500 shrink-0">or more →</span>
              <span className="text-sm text-slate-500 shrink-0">₦</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={r.unitPrice}
                onChange={(e) => setRow(i, { unitPrice: e.target.value })}
                placeholder="900"
                className="w-24 px-2 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
              />
              <span className="text-xs text-slate-500 shrink-0">each</span>
              <button type="button" onClick={() => remove(i)} className="ml-auto text-slate-400 hover:text-red-600 cursor-pointer shrink-0">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length < 6 && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
        >
          <Plus size={13} /> Add a price break
        </button>
      )}
    </div>
  );
}
