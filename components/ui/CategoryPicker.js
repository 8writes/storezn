"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { slugify } from "@/lib/slugify.js";

// The product form's Category, with "+ New category" right under it -
// type a name, it's created and selected, without leaving the form. Stays
// a plain button row (not a nested <form>) so Enter or Add can never
// submit the product.
export function CategoryPicker({ storeId, apiFetch, categories, value, onChange, onCreated }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const options = [{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Enter a category name");
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: trimmed, slug: slugify(trimmed) }),
      });
      onCreated(data.category);
      onChange(data.category.id);
      setName("");
      setAdding(false);
    } catch (err) {
      toast.error(err.message || "Could not add the category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Select label="Category" options={options} value={value} onChange={onChange} />
      {adding ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="New category name"
            maxLength={100}
            className="h-9 flex-1 min-w-0 rounded-sm border border-slate-300 bg-surface px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
          />
          <Button type="button" size="sm" onClick={create} loading={saving}>Add</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-brand-700 hover:underline cursor-pointer">
          + New category
        </button>
      )}
    </div>
  );
}
