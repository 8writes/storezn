"use client";
import { useState } from "react";

// Read-only render of a structured size guide (see sizeGuideSchema in
// lib/validate.js) - a real measurements table with a cm/inch toggle
// that converts numeric cells, and an optional swap of which sizing
// system leads. Shared by the storefront modal and the vendor view.
export function SizeGuideTable({ guide, showControls = true }) {
  const [unit, setUnit] = useState(guide?.unit || "cm");
  const [altFirst, setAltFirst] = useState(false);
  if (!guide?.columns?.length || !guide?.rows?.length) return null;

  const hasAlt = !!String(guide.altLabel || "").trim() && guide.rows.some((r) => String(r.alt || "").trim());
  const sizeHead = guide.sizeLabel || "Size";
  const altHead = guide.altLabel || "";

  const convert = (raw) => {
    if (unit === guide.unit) return raw;
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return raw;
    const out = guide.unit === "cm" ? n / 2.54 : n * 2.54;
    return String(Math.round(out * 10) / 10);
  };

  const leadHead = hasAlt && altFirst ? altHead : sizeHead;
  const secondHead = hasAlt && altFirst ? sizeHead : altHead;
  const lead = (r) => (hasAlt && altFirst ? r.alt : r.size);
  const second = (r) => (hasAlt && altFirst ? r.size : r.alt);

  return (
    <div className="space-y-3">
      {showControls && (
        <div className="flex flex-wrap items-center gap-3">
          {hasAlt && (
            <button
              type="button"
              onClick={() => setAltFirst((v) => !v)}
              className="text-xs font-medium text-brand-600 hover:underline cursor-pointer"
            >
              Show {altFirst ? sizeHead : altHead} first
            </button>
          )}
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
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left">
              <th className="px-3 py-2 font-medium whitespace-nowrap">{leadHead}</th>
              {hasAlt && <th className="px-3 py-2 font-medium whitespace-nowrap">{secondHead}</th>}
              {guide.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{lead(r) || "-"}</td>
                {hasAlt && <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{second(r) || "-"}</td>}
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
