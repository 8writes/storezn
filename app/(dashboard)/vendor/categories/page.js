"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { slugify } from "@/lib/slugify.js";

const EMPTY_FORM = { name: "", slug: "" };

// Store-wide category list - the single source every product form and the
// storefront's category filter reads from, so it's managed here once
// rather than re-created ad hoc on each product.
export default function VendorCategoriesPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [categories, setCategories] = useState([]);
  const [visible, setVisible] = useState(10);
  const [loading, setLoading] = useState(true);

  // One form for both add and edit - editingId null means "add", set means
  // "editing that row". Inline row inputs read badly on a narrow screen,
  // so editing reuses this same full-width form and just swaps the button.
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const formRef = useRef(null);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => {
        setCategories(data.categories);
        setVisible(10);
      })
      .catch((err) => toast.error(err.message || "Failed to load categories"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Also gated on token, not just storeId - storeId can be populated
    // from shared context before this page's token resolves on a
    // client-side navigation (see VendorStoreContext.js).
    if (!token || !storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setEditingId(null);
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setForm({ name: category.name, slug: category.slug });
    setSlugTouched(true);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { name: form.name.trim(), slug: (form.slug || slugify(form.name)).trim() };
    if (!payload.name || !payload.slug) return;
    setSubmitting(true);
    try {
      if (editingId) {
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/categories/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setCategories((c) => c.map((x) => (x.id === editingId ? { ...x, ...data.category } : x)).sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Category updated");
      } else {
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/categories`, { method: "POST", body: JSON.stringify(payload) });
        setCategories((c) => [...c, { ...data.category, productCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Category added");
      }
      resetForm();
    } catch (err) {
      toast.error(err.message || (editingId ? "Failed to update category" : "Failed to add category"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category) => {
    const ok = await confirm({
      title: `Delete "${category.name}"?`,
      description:
        category.productCount > 0
          ? `${category.productCount} product${category.productCount === 1 ? "" : "s"} will stay, but lose this category.`
          : "This category has no products.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    if (editingId === category.id) resetForm();
    setDeletingId(category.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/categories/${category.id}`, { method: "DELETE" });
      setCategories((c) => c.filter((x) => x.id !== category.id));
      toast.success("Category deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <BackLink onClick={() => router.back()} label="Back" />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Categories</h1>
        <p className="text-sm text-slate-500 mt-1">
          Shared across every product and used as the category filter on your storefront.
        </p>
      </div>

      {loading ? (
        <FormSkeleton fields={3} />
      ) : (
        <>
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200 rounded-sm p-5 space-y-4 scroll-mt-4"
          >
            <p className="text-sm font-semibold text-slate-700">
              {editingId ? "Edit category" : "Add a category"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Name"
                placeholder="e.g. Bags"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                }}
                required
              />
              <Input
                label="Slug"
                placeholder="bags"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                required
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={submitting} fullWidth>
                {editingId ? "Save changes" : "Add category"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            {categories.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-700">No categories yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {categories.slice(0, visible).map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${editingId === c.id ? "bg-brand-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        /{c.slug} · {c.productCount ?? 0} product{(c.productCount ?? 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-slate-500 hover:text-brand-600 cursor-pointer"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="text-slate-500 hover:text-red-600 disabled:opacity-40 cursor-pointer"
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {categories.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((n) => n + 10)}
              className="text-sm font-medium text-brand-600 hover:underline cursor-pointer"
            >
              Show 10 more ({categories.length - visible} left)
            </button>
          )}
        </>
      )}

      {confirmDialog}
    </div>
  );
}
