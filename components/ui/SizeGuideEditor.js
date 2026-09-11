"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";

const EMPTY_GUIDE = {
  unit: "cm",
  sizeLabel: "",
  altLabel: "",
  columns: ["Bust"],
  rows: [{ size: "", alt: "", values: [""] }],
  note: "",
};
const cellClass = "w-20 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500";

// Trims the working state to something the API accepts: drops unnamed
// measurement columns (and their cells), drops empty rows, and returns
// null if nothing meaningful is left - so a half-started guide just
// doesn't get saved rather than 400ing.
export function normalizeSizeGuide(g) {
  if (!g || !Array.isArray(g.columns) || !Array.isArray(g.rows)) return null;
  const keep = g.columns.map((c, i) => ({ name: String(c || "").trim(), i })).filter((c) => c.name);
  if (keep.length === 0) return null;
  const rows = g.rows
    .map((r) => ({
      size: String(r.size || "").trim(),
      alt: String(r.alt || "").trim(),
      values: keep.map((c) => String(r.values?.[c.i] || "").trim()),
    }))
    .filter((r) => r.size || r.alt || r.values.some(Boolean))
    .map((r) => (r.alt ? r : { size: r.size, values: r.values }));
  if (rows.length === 0) return null;
  return {
    unit: g.unit === "in" ? "in" : "cm",
    ...(String(g.sizeLabel || "").trim() ? { sizeLabel: String(g.sizeLabel).trim() } : {}),
    ...(String(g.altLabel || "").trim() ? { altLabel: String(g.altLabel).trim() } : {}),
    columns: keep.map((c) => c.name),
    rows,
    ...(String(g.note || "").trim() ? { note: String(g.note).trim() } : {}),
  };
}

// Builds the structured size chart on products.sizeGuide - a grid of
// measurement columns x size rows, plus the sizing-system names, a unit,
// and a fit note. Controlled: `value` is the guide object (or null),
// every edit calls `onChange` with the next object (or null to remove).
export function SizeGuideEditor({ value, onChange }) {
  const guide = value || null;

  if (!guide) {
    return (
      <div>
        <label className="text-sm font-medium text-slate-700">Size guide</label>
        <p className="text-xs text-slate-500 mt-0.5 mb-2">
          A measurements table shoppers open from the product page. Use the same size names as your Size
          variant values and the measurements show inline when a shopper picks that size.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(structuredClone(EMPTY_GUIDE))}>
          <Plus size={14} /> Add size guide
        </Button>
      </div>
    );
  }

  const { unit, sizeLabel, altLabel, columns, rows, note } = guide;
  const set = (patch) => onChange({ ...guide, ...patch });
  const hasAlt = String(altLabel || "").trim().length > 0;

  const addColumn = () =>
    onChange({ ...guide, columns: [...columns, ""], rows: rows.map((r) => ({ ...r, values: [...(r.values || []), ""] })) });
  const removeColumn = (ci) =>
    onChange({
      ...guide,
      columns: columns.filter((_, i) => i !== ci),
      rows: rows.map((r) => ({ ...r, values: (r.values || []).filter((_, i) => i !== ci) })),
    });
  const setColName = (ci, v) => onChange({ ...guide, columns: columns.map((c, i) => (i === ci ? v : c)) });
  const addRow = () => onChange({ ...guide, rows: [...rows, { size: "", alt: "", values: columns.map(() => "") }] });
  const removeRow = (ri) => onChange({ ...guide, rows: rows.filter((_, i) => i !== ri) });
  const setRow = (ri, patch) => onChange({ ...guide, rows: rows.map((r, i) => (i === ri ? { ...r, ...patch } : r)) });
  const setCell = (ri, ci, v) =>
    setRow(ri, { values: (rows[ri].values || []).map((val, j) => (j === ci ? v : val)) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Size guide</label>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-600">
          Primary size system
          <input
            value={sizeLabel || ""}
            onChange={(e) => set({ sizeLabel: e.target.value })}
            placeholder="e.g. UK, US, EU"
            className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
          />
        </label>
        <label className="text-xs text-slate-600">
          Second system (optional)
          <input
            value={altLabel || ""}
            onChange={(e) => set({ altLabel: e.target.value })}
            placeholder="e.g. EUR, shown as UK7.5 (EUR41)"
            className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Measurements in</span>
        {["cm", "in"].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => set({ unit: u })}
            className={`px-2.5 py-1 text-xs rounded-sm border cursor-pointer transition-colors ${
              unit === u
                ? "border-brand-600 bg-brand-50 text-brand-700 font-medium"
                : "border-slate-300 text-slate-600 hover:border-slate-400"
            }`}
          >
            {u === "cm" ? "cm" : "inch"}
          </button>
        ))}
        <span className="text-xs text-slate-400">shoppers can switch on the storefront</span>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-sm">
        <table className="text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="p-2 text-left text-xs font-medium text-slate-500">{sizeLabel || "Size"}</th>
              {hasAlt && <th className="p-2 text-left text-xs font-medium text-slate-500">{altLabel}</th>}
              {columns.map((c, ci) => (
                <th key={ci} className="p-2">
                  <div className="flex items-center gap-1">
                    <input
                      value={c}
                      onChange={(e) => setColName(ci, e.target.value)}
                      placeholder="Bust"
                      className="w-28 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(ci)}
                      disabled={columns.length <= 1}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                      aria-label="Remove measurement"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-2">
                <button
                  type="button"
                  onClick={addColumn}
                  className="text-brand-600 hover:text-brand-700 cursor-pointer"
                  aria-label="Add measurement"
                >
                  <Plus size={16} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                <td className="p-2">
                  <input
                    value={r.size}
                    onChange={(e) => setRow(ri, { size: e.target.value })}
                    placeholder="UK7.5"
                    className="w-20 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                  />
                </td>
                {hasAlt && (
                  <td className="p-2">
                    <input
                      value={r.alt || ""}
                      onChange={(e) => setRow(ri, { alt: e.target.value })}
                      placeholder="EUR41"
                      className="w-20 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                    />
                  </td>
                )}
                {columns.map((_, ci) => (
                  <td key={ci} className="p-2">
                    <input
                      value={r.values?.[ci] || ""}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      placeholder="9.1"
                      className={cellClass}
                    />
                  </td>
                ))}
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => removeRow(ri)}
                    disabled={rows.length <= 1}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    aria-label="Remove size"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-xs font-medium text-brand-600 hover:underline cursor-pointer"
      >
        + Add size
      </button>

      <textarea
        value={note || ""}
        onChange={(e) => set({ note: e.target.value })}
        rows={2}
        maxLength={500}
        placeholder="Fit tip, e.g. “Runs large, go one size down.”"
        className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
      />
    </div>
  );
}
