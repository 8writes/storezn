"use client";
import { Plus, X } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip.js";

// Bundle / wholesale pricing. value is [{ bundleQty, unitPrice }] (or
// null). Emits null when there are no rows so the field clears cleanly.
export function WholesaleTierEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : [];

  const emit = (next) => onChange(next.length ? next : null);
  const setRow = (i, patch) => emit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => emit([...rows, { bundleQty: "", unitPrice: "" }]);
  const remove = (i) => emit(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700">Wholesale / bundle pricing</label>
        <InfoTip>
          Sell in bundles at a lower price per unit. e.g. a bundle of 10 at &#8358;900 each: a customer buying 11 pays 10 at
          &#8358;900 and the last 1 at the normal price &mdash; it works out automatically at checkout and on the register.
          Add more bundle sizes (10, 50, 100) for deeper breaks. Leave empty for one flat price.
        </InfoTip>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 shrink-0">Bundle of</span>
              <input
                type="number"
                min="2"
                inputMode="numeric"
                value={r.bundleQty}
                onChange={(e) => setRow(i, { bundleQty: e.target.value })}
                placeholder="10"
                className="w-16 px-2 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
              />
              <span className="text-xs text-slate-500 shrink-0">&rarr;</span>
              <span className="text-sm text-slate-500 shrink-0">&#8358;</span>
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
          <Plus size={13} /> Add a bundle price
        </button>
      )}
    </div>
  );
}
