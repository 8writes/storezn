"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";

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
  const [expanded, setExpanded] = useState(false);
  const fields = Array.isArray(value) ? value : [];

  const update = (index, patch) => {
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  };

  const add = () => {
    if (fields.length >= 20) return;
    onChange([...fields, newField(fields.length)]);
    setExpanded(true);
  };

  const remove = (index) => onChange(fields.filter((_, i) => i !== index));

  return (
    <section className="border-t border-slate-200 pt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Customer details
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Ask buyers for information needed to prepare this product.
          </p>
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-slate-600">No details requested.</p>
      ) : expanded ? (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id || index}
              className="border border-slate-200 rounded-sm p-3 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Label"
                  value={field.label || ""}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="e.g. Measurements"
                  required
                />
                <Select
                  label="Answer type"
                  options={TYPES}
                  value={field.type || "text"}
                  onChange={(type) =>
                    update(index, {
                      type,
                      options: type === "select" ? field.options || [] : [],
                    })
                  }
                />
              </div>
              {field.type === "select" && (
                <Input
                  label="Options"
                  value={(field.options || []).join(", ")}
                  onChange={(e) =>
                    update(index, {
                      options: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Small, Medium, Large"
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Placeholder (optional)"
                  value={field.placeholder || ""}
                  onChange={(e) =>
                    update(index, { placeholder: e.target.value })
                  }
                />
                <Input
                  label="Help text (optional)"
                  value={field.helpText || ""}
                  onChange={(e) => update(index, { helpText: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required === true}
                    onChange={(e) =>
                      update(index, { required: e.target.checked })
                    }
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="Remove customer field"
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 cursor-pointer"
                >
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs font-medium text-brand-700 hover:text-brand-800 cursor-pointer"
            >
              Collapse fields
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left border border-slate-200 rounded-sm p-3 hover:bg-slate-50 cursor-pointer"
        >
          <span className="block text-sm font-medium text-slate-900">
            {fields.length} customer field{fields.length === 1 ? "" : "s"}
          </span>
          <span className="block text-xs text-slate-600 mt-1">
            {fields.map((field) => field.label || "Untitled field").join(", ")}
          </span>
        </button>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={add}
          disabled={fields.length >= 20}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <Plus size={16} /> Add new field
        </button>
      </div>
    </section>
  );
}
