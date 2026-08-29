"use client";
import { useState } from "react";

// Read-only render of a structured size guide (see sizeGuideSchema in
// lib/validate.js) - a real measurements table with an optional cm/in
// toggle that converts numeric cells on the fly. Shared by the storefront
// modal (SizeGuideButton) and the vendor product view.
export function SizeGuideTable({ guide, showToggle = true }) {
  const [unit, setUnit] = useState(guide?.unit || "cm");
  if (!guide?.columns?.length || !guide?.rows?.length) return null;

  const convert = (raw) => {
    if (unit === guide.unit) return raw;
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return raw;
    const out = guide.unit === "cm" ? n / 2.54 : n * 2.54;
    return String(Math.round(out * 10) / 10);
  };

  return (
    <div className="space-y-3">
      {showToggle && (
        <div className="flex items-center gap-1.5">
          {["cm", "in"].map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 text-xs rounded-sm border cursor-pointer transition-colors ${
                unit === u
                  ? "border-brand-600 bg-brand-50 text-brand-700 font-medium"
                  : "border-slate-300 text-slate-600 hover:border-slate-400"
              }`}
            >
              {u === "cm" ? "cm" : "inch"}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left">
              <th className="px-3 py-2 font-medium">Size</th>
              {guide.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{r.size}</td>
                {r.values.map((v, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-700 whitespace-nowrap">{convert(v) || "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {guide.note && <p className="text-xs text-slate-500 leading-relaxed">{guide.note}</p>}
    </div>
  );
}
