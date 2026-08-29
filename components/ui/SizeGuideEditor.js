"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";

const EMPTY_GUIDE = { unit: "cm", columns: ["Bust"], rows: [{ size: "", values: [""] }], note: "" };

// Trims the working state down to something the API will accept: drops
// unnamed measurement columns (and their cells), drops rows with nothing
// in them, and returns null if there's no real content left - so a
// half-started guide just doesn't get saved rather than 400ing.
export function normalizeSizeGuide(g) {
  if (!g || !Array.isArray(g.columns) || !Array.isArray(g.rows)) return null;
  const keep = g.columns.map((c, i) => ({ name: String(c || "").trim(), i })).filter((c) => c.name);
  if (keep.length === 0) return null;
  const rows = g.rows
    .map((r) => ({
      size: String(r.size || "").trim(),
      values: keep.map((c) => String(r.values?.[c.i] || "").trim()),
    }))
    .filter((r) => r.size || r.values.some(Boolean));
  if (rows.length === 0) return null;
  return {
    unit: g.unit === "in" ? "in" : "cm",
    columns: keep.map((c) => c.name),
    rows,
    ...(String(g.note || "").trim() ? { note: String(g.note).trim() } : {}),
  };
}
const cellClass =
  "w-20 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500";

// Builds the structured size chart stored on products.sizeGuide - a grid
// of measurement columns × size rows, plus a unit and an optional note.
// Controlled: `value` is the guide object (or null), every edit calls
// `onChange` with the next object (or null to remove it entirely).
export function SizeGuideEditor({ value, onChange }) {
  const guide = value || null;

  if (!guide) {
    return (
      <div>
        <label className="text-sm font-medium text-slate-700">Size guide</label>
        <p className="text-xs text-slate-500 mt-0.5 mb-2">
          A measurements table shoppers can open from the product page (with a cm/inch toggle).
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(structuredClone(EMPTY_GUIDE))}>
          <Plus size={14} /> Add size guide
        </Button>
      </div>
    );
  }

  const { unit, columns, rows, note } = guide;
  const set = (patch) => onChange({ ...guide, ...patch });

  const addColumn = () =>
    onChange({ ...guide, columns: [...columns, ""], rows: rows.map((r) => ({ ...r, values: [...r.values, ""] })) });
  const removeColumn = (ci) =>
    onChange({
      ...guide,
      columns: columns.filter((_, i) => i !== ci),
      rows: rows.map((r) => ({ ...r, values: r.values.filter((_, i) => i !== ci) })),
    });
  const setColName = (ci, v) => onChange({ ...guide, columns: columns.map((c, i) => (i === ci ? v : c)) });
  const addRow = () => onChange({ ...guide, rows: [...rows, { size: "", values: columns.map(() => "") }] });
  const removeRow = (ri) => onChange({ ...guide, rows: rows.filter((_, i) => i !== ri) });
  const setSize = (ri, v) => onChange({ ...guide, rows: rows.map((r, i) => (i === ri ? { ...r, size: v } : r)) });
  const setCell = (ri, ci, v) =>
    onChange({
      ...guide,
      rows: rows.map((r, i) => (i === ri ? { ...r, values: r.values.map((val, j) => (j === ci ? v : val)) } : r)),
    });

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Values entered in</span>
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
              <th className="p-2 text-left text-xs font-medium text-slate-500">Size</th>
              {columns.map((c, ci) => (
                <th key={ci} className="p-2">
                  <div className="flex items-center gap-1">
                    <input
                      value={c}
                      onChange={(e) => setColName(ci, e.target.value)}
                      placeholder="Bust"
                      className="w-24 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
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
                    onChange={(e) => setSize(ri, e.target.value)}
                    placeholder="M"
                    className="w-16 px-2 py-1 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                  />
                </td>
                {r.values.map((val, ci) => (
                  <td key={ci} className="p-2">
                    <input
                      value={val}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      placeholder="90"
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
        placeholder="Optional note, e.g. “Measurements are of the garment. Allow 1-2cm difference.”"
        className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
      />
    </div>
  );
}
