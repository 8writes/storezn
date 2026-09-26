"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

const emptyDimension = () => ({ name: "", values: "" });

const parseValues = (value) => [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))];

const cartesian = (dimensions) =>
  dimensions.reduce((rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.name]: value }))), [{}]);

const keyFor = (options) => JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

export function NewProductVariantsEditor({ value = [], onChange, invoiceRequired = false }) {
  const [dimensions, setDimensions] = useState([emptyDimension()]);
  const [message, setMessage] = useState("");
  const [variantsCollapsed, setVariantsCollapsed] = useState(false);

  const variants = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const variantMap = useMemo(() => new Map(variants.map((variant) => [keyFor(variant.options || {}), variant])), [variants]);

  const updateDimension = (index, patch) => {
    setDimensions((current) => current.map((dimension, i) => (i === index ? { ...dimension, ...patch } : dimension)));
  };

  const generate = () => {
    const parsed = dimensions
      .map((dimension) => ({ name: dimension.name.trim(), values: parseValues(dimension.values) }))
      .filter((dimension) => dimension.name || dimension.values.length);
    if (!parsed.length || parsed.some((dimension) => !dimension.name || !dimension.values.length)) {
      setMessage("Give every option a name and at least one value.");
      return;
    }
    const names = parsed.map((dimension) => dimension.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      setMessage("Option names must be different.");
      return;
    }
    const combinationCount = parsed.reduce((count, dimension) => count * dimension.values.length, 1);
    if (combinationCount > 200) {
      setMessage("Reduce the option values to 200 variant combinations or fewer.");
      return;
    }
    const rows = cartesian(parsed).map((options) => {
      const existing = variantMap.get(keyFor(options));
      return {
        options,
        sku: existing?.sku || "",
        price: invoiceRequired ? null : existing?.price ?? null,
        stock: existing?.stock ?? null,
        isActive: existing?.isActive !== false,
      };
    });
    onChange(rows);
    setVariantsCollapsed(false);
    setMessage(`${rows.length} variant${rows.length === 1 ? "" : "s"} ready to save.`);
  };

  const updateVariant = (index, patch) => onChange(variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  const toggleLabel = variantsCollapsed ? `Show ${variants.length} variant${variants.length === 1 ? "" : "s"}` : "Collapse variants";
  const ToggleIcon = variantsCollapsed ? ChevronDown : ChevronUp;

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Variants</p>
        <p className="text-xs text-slate-700 mt-1">Generate combinations such as Size and Colour, then set each SKU, price, and stock before saving.</p>
      </div>
      <div className="space-y-2">
        {dimensions.map((dimension, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <input
              value={dimension.name}
              onChange={(event) => updateDimension(index, { name: event.target.value })}
              placeholder="Option name, e.g. Size"
              className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
            />
            <input
              value={dimension.values}
              onChange={(event) => updateDimension(index, { values: event.target.value })}
              placeholder="Values separated by commas, e.g. S, M, L"
              className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
            />
            {dimensions.length > 1 ? (
              <button type="button" onClick={() => setDimensions((current) => current.filter((_, i) => i !== index))} aria-label="Remove option" className="h-10 w-10 inline-flex items-center justify-center text-slate-600 hover:text-red-600 cursor-pointer ml-auto">
                <Trash2 size={16} />
              </button>
            ) : <span />}
          </div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row md:justify-end flex-wrap gap-2 pb-7">
        <button type="button" disabled={dimensions.length >= 5} onClick={() => setDimensions((current) => [...current, emptyDimension()])} className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus size={15} /> Add option
        </button>
        <button type="button" onClick={generate} className="inline-flex items-center justify-center rounded-sm bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 cursor-pointer w-full md:w-auto">
          Generate variants
        </button>
      </div>
      {message && <p className="text-xs text-center text-slate-700 pb-4">{message}</p>}
      {variants.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-xs font-medium text-slate-700">{variants.length} variant{variants.length === 1 ? "" : "s"}</p>
            <button
              type="button"
              onClick={() => setVariantsCollapsed((current) => !current)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer sm:w-auto"
            >
              <ToggleIcon size={14} />
              {toggleLabel}
            </button>
          </div>
          {variantsCollapsed ? (
            <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-700">
              Variant rows are hidden. Open them when you need to edit SKU, price, or stock.
            </div>
          ) : (
            <>
              <div className="max-h-[34rem] space-y-2 overflow-y-auto rounded-sm border border-slate-200 bg-slate-50/50 p-2 pr-1">
                {variants.map((variant, index) => (
                  <div key={keyFor(variant.options)} className="border border-slate-200 rounded-sm p-3 space-y-2">
                    <p className="text-sm font-medium text-slate-900">{Object.entries(variant.options).map(([name, option]) => `${name}: ${option}`).join(" - ")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        value={variant.sku || ""}
                        onChange={(event) => updateVariant(index, { sku: event.target.value })}
                        placeholder="SKU / barcode"
                        className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                      />
                      {!invoiceRequired && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.price ?? ""}
                          onChange={(event) => updateVariant(index, { price: event.target.value === "" ? null : Number(event.target.value) })}
                          placeholder="Price override"
                          className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                        />
                      )}
                      <input
                        type="number"
                        min="0"
                        value={variant.stock ?? ""}
                        onChange={(event) => updateVariant(index, { stock: event.target.value === "" ? null : Number(event.target.value) })}
                        placeholder="Stock (blank = unlimited)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setVariantsCollapsed(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer sm:w-auto"
                >
                  <ChevronUp size={14} />
                  Collapse variants
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
