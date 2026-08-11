"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { uploadFile } from "@/lib/clientUpload.js";
import { slugify } from "@/lib/slugify.js";
import { X, ImagePlus, Loader2, GripVertical } from "lucide-react";

const MAX_IMAGES = 8;

const PRODUCT_TYPE_OPTIONS = [
  { value: "physical", label: "Physical (needs shipping)" },
  { value: "digital", label: "Digital (no shipping)" },
];

const CONDITION_OPTIONS = [
  { value: "new", label: "Brand New" },
  { value: "fairly_used", label: "Fairly Used" },
  { value: "used", label: "Used" },
];

const EMPTY_FORM = { name: "", slug: "", sku: "", description: "", price: "", productType: "physical", condition: "new", stock: "", categoryId: "", images: [] };
const EMPTY_CATEGORY = { name: "", slug: "" };

export default function VendorNewProductPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(searchParams.get("storeId") || "");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [categorySlugTouched, setCategorySlugTouched] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (!storeId && data.stores.length > 0) setStoreId(data.stores[0].id);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  // Images are uploaded to storage immediately (same as the edit page's
  // grid), but since there's no product row yet to PATCH, they just
  // accumulate in local form state and go out together with the create
  // POST below - no separate "add photos after creating" detour.
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const room = MAX_IMAGES - form.images.length - pendingUploads.length;
    if (room <= 0) {
      toast.error(`You can only have up to ${MAX_IMAGES} photos`);
      return;
    }
    const toUpload = files.slice(0, room);
    if (files.length > toUpload.length) toast.error(`Only added ${toUpload.length} - max ${MAX_IMAGES} photos per product`);

    const entries = toUpload.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, localUrl: URL.createObjectURL(file) }));
    setPendingUploads((p) => [...p, ...entries]);

    await Promise.all(
      entries.map(async (entry) => {
        try {
          const url = await uploadFile(token, entry.file, "product-image");
          setForm((f) => ({ ...f, images: [...f.images, url] }));
        } catch (err) {
          toast.error(err.message || "Upload failed");
        } finally {
          URL.revokeObjectURL(entry.localUrl);
          setPendingUploads((p) => p.filter((e2) => e2.key !== entry.key));
        }
      }),
    );
  };

  const removeImage = (url) => setForm((f) => ({ ...f, images: f.images.filter((i) => i !== url) }));

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    setForm((f) => {
      const images = [...f.images];
      const [moved] = images.splice(dragIndex, 1);
      images.splice(dropIndex, 0, moved);
      return { ...f, images };
    });
    setDragIndex(null);
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setAddingCategory(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/categories`, { method: "POST", body: JSON.stringify(categoryForm) });
      setCategories((c) => [...c, data.category]);
      setForm((f) => ({ ...f, categoryId: data.category.id }));
      setCategoryForm(EMPTY_CATEGORY);
      setCategorySlugTouched(false);
      toast.success("Category added");
    } catch (err) {
      toast.error(err.message || "Failed to add category");
    } finally {
      setAddingCategory(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (pendingUploads.length > 0) {
      toast.error("Wait for photo uploads to finish");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        price: Number(form.price),
        productType: form.productType,
        condition: form.condition,
        images: form.images,
      };
      if (form.stock !== "") payload.stock = Number(form.stock);
      if (form.categoryId) payload.categoryId = form.categoryId;
      if (form.sku) payload.sku = form.sku;
      if (form.description) payload.description = form.description;

      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products`, { method: "POST", body: JSON.stringify(payload) });
      toast.success("Product created");
      router.replace(`/vendor/products/${data.product.id}?storeId=${storeId}`);
    } catch (err) {
      toast.error(err.message || "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <BackLink href="/vendor/products" label="Back to products" />
        <FormSkeleton fields={6} />
      </div>
    );
  }

  if (stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <BackLink href="/vendor/products" label="Back to products" />
      <h1 className="text-xl font-bold text-slate-900">Add product</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <form onSubmit={handleCreate} className="lg:col-span-2 bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          {stores.length > 1 && (
            <div className="max-w-xs">
              <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
              }}
              required
            />
            <Input
              label="URL slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((f) => ({ ...f, slug: e.target.value }));
              }}
              required
            />
            <Input label="SKU (optional)" placeholder="e.g. RTB-001" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            <PriceInput label="Price" placeholder="0.00" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} required />
            <Select label="Type" options={PRODUCT_TYPE_OPTIONS} value={form.productType} onChange={(v) => setForm((f) => ({ ...f, productType: v }))} />
            {form.productType === "physical" && (
              <>
                <Select label="Condition" options={CONDITION_OPTIONS} value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />
                <Input label="Stock (optional)" type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} />
              </>
            )}
            <Select label="Category (optional)" options={categoryOptions} value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />
          </div>

          <Textarea label="Description (optional)" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Photos</label>
            <p className="text-xs text-slate-500">
              Drag to reorder - the first photo is the cover shown in your store. Up to {MAX_IMAGES}.
            </p>
            <div className="flex flex-wrap gap-3">
              {form.images.map((url, index) => (
                <div
                  key={url}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                  className={`group relative w-24 h-24 rounded-sm border border-slate-200 overflow-hidden cursor-grab active:cursor-grabbing ${
                    dragIndex === index ? "opacity-40" : ""
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {index === 0 && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-slate-900/80 text-white text-[10px] font-medium">
                      Cover
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-start justify-between p-1 opacity-0 group-hover:opacity-100">
                    <GripVertical size={16} className="text-white drop-shadow" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      aria-label="Remove photo"
                      className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {pendingUploads.map((entry) => (
                <div key={entry.key} className="relative w-24 h-24 rounded-sm border border-slate-200 overflow-hidden">
                  <img src={entry.localUrl} alt="" className="w-full h-full object-cover opacity-50" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Loader2 size={20} className="text-white animate-spin" />
                  </div>
                </div>
              ))}

              {form.images.length + pendingUploads.length < MAX_IMAGES && (
                <label className="w-24 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                  <ImagePlus size={20} />
                  <span className="text-[11px] font-medium">Add photos</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <Button type="submit" loading={submitting} disabled={pendingUploads.length > 0}>Create product</Button>
        </form>

        <form onSubmit={handleAddCategory} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Add a category</p>
          <Input
            label="Name"
            value={categoryForm.name}
            onChange={(e) => {
              const name = e.target.value;
              setCategoryForm((f) => ({ ...f, name, slug: categorySlugTouched ? f.slug : slugify(name) }));
            }}
            required
          />
          <Input
            label="Slug"
            value={categoryForm.slug}
            onChange={(e) => {
              setCategorySlugTouched(true);
              setCategoryForm((f) => ({ ...f, slug: e.target.value }));
            }}
            required
          />
          <Button type="submit" variant="outline" size="sm" loading={addingCategory}>Add category</Button>
        </form>
      </div>
    </div>
  );
}
