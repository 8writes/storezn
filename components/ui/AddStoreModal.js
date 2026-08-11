"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { slugify } from "@/lib/slugify.js";

// Rendered by the caller only while open ({addOpen && <AddStoreModal .../>}
// in StoreSwitcher.js) rather than always-mounted-but-hidden - a fresh
// mount each time means the form state below starts clean via its own
// initial useState value, with no separate "reset on open" effect needed.
export function AddStoreModal({ onClose, onCreated, apiFetch }) {
  const [form, setForm] = useState({ name: "", slug: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/v1/vendor/stores", { method: "POST", body: JSON.stringify(form) });
      toast.success("Store created");
      onCreated(data.store);
    } catch (err) {
      toast.error(err.message || "Failed to create store");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-white rounded-sm shadow-xl w-full max-w-sm p-6 space-y-4 my-auto">
        <div>
          <h2 className="font-semibold text-slate-900">Add a store</h2>
          <p className="text-sm text-slate-500 mt-1">Give it a name - you can fill in the rest from Store settings after.</p>
        </div>

        <Input
          label="Store name"
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
          }}
          autoFocus
          required
        />
        <Input
          label="Store URL"
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }));
          }}
          required
        />

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" loading={submitting}>Create store</Button>
        </div>
      </form>
    </div>
  );
}
