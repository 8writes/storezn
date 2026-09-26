"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

const TYPES = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

const newField = (index) => ({
  id: `field_${Date.now()}_${index}`.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  helpText: "",
  options: [],
});

export function CustomerFieldsEditor({ value = [], onChange }) {
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const fields = Array.isArray(value) ? value : [];

  useModalScrollLock(fieldsOpen);

  useEffect(() => {
    if (!fieldsOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFieldsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [fieldsOpen]);

  const update = (index, patch) => {
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  };

  const add = () => {
    if (fields.length >= 20) return;
    onChange([...fields, newField(fields.length)]);
  };

  const remove = (index) => onChange(fields.filter((_, i) => i !== index));

  return (
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Customer details</h2>
        <p className="mt-1 text-xs text-slate-700">
          {fields.length > 0
            ? `${fields.length} customer field${fields.length === 1 ? "" : "s"} configured.`
            : "Ask buyers for the information needed to prepare this product."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setFieldsOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-sm bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 cursor-pointer sm:w-auto"
      >
        {fields.length > 0 ? "Manage customer details" : "Add customer details"}
      </button>

      {fieldsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-none sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setFieldsOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="customer-fields-dialog-title" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-2xl sm:rounded-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id="customer-fields-dialog-title" className="font-semibold text-slate-900">Customer details</h2>
                <p className="mt-0.5 text-sm text-slate-600">Ask for the information you need before this product can be prepared.</p>
              </div>
              <button type="button" aria-label="Close customer details" onClick={() => setFieldsOpen(false)} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="space-y-3">
                {fields.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-700">No customer details requested yet.</p>
                ) : fields.map((field, index) => (
                  <div key={field.id || index} className="space-y-3 rounded-sm border border-slate-200 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label="Label" value={field.label || ""} onChange={(event) => update(index, { label: event.target.value })} placeholder="e.g. Measurements" required />
                      <Select
                        label="Answer type"
                        options={TYPES}
                        value={field.type || "text"}
                        onChange={(type) => update(index, { type, options: type === "select" ? field.options || [] : [] })}
                      />
                    </div>
                    {field.type === "select" && (
                      <Input
                        label="Options"
                        value={(field.options || []).join(", ")}
                        onChange={(event) => update(index, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })}
                        placeholder="Small, Medium, Large"
                      />
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label="Placeholder (optional)" value={field.placeholder || ""} onChange={(event) => update(index, { placeholder: event.target.value })} />
                      <Input label="Help text (optional)" value={field.helpText || ""} onChange={(event) => update(index, { helpText: event.target.value })} />
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={field.required === true} onChange={(event) => update(index, { required: event.target.checked })} />
                        Required
                      </label>
                      <button type="button" onClick={() => remove(index)} aria-label="Remove customer field" className="inline-flex items-center justify-center gap-1 rounded-sm px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer sm:justify-self-end">
                        <Trash2 size={15} /> Remove field
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button type="button" onClick={add} disabled={fields.length >= 20} className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-slate-300 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-slate-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer sm:w-auto">
                    <Plus size={16} /> Add new field
                  </button>
                </div>
                {fields.length >= 20 && <p className="text-right text-xs text-slate-600">Maximum of 20 customer fields reached.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
