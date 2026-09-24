"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { BarcodeScanButton } from "@/components/pos/BarcodeScanButton.js";
import { WholesaleTierEditor } from "@/components/ui/WholesaleTierEditor.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { SizeGuideEditor, normalizeSizeGuide } from "@/components/ui/SizeGuideEditor.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { StorageLimitDialog } from "@/components/ui/StorageLimitDialog.js";
import { NewProductVariantsEditor } from "@/components/ui/NewProductVariantsEditor.js";
import { CustomerFieldsEditor } from "@/components/ui/CustomerFieldsEditor.js";
import { ProductFormFieldsButton } from "@/components/ui/ProductFormFieldsButton.js";
import { uploadFile, deleteUploadedFile, getVideoDuration } from "@/lib/clientUpload.js";
import { slugify } from "@/lib/slugify.js";
import { formatCurrency } from "@/lib/format.js";
import { X, ImagePlus, Loader2, GripVertical, Video } from "lucide-react";

// Photos and video share one combined cap - a video eats one of the 10
// slots, same as a photo would.
const MAX_MEDIA = 10;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

const PRODUCT_TYPE_OPTIONS = [
  { value: "physical", label: "Physical (needs shipping)" },
];

const SALE_MODE_OPTIONS = [
  { value: "fixed_price", label: "Fixed price" },
  { value: "invoice_required", label: "Request invoice (price agreed later)" },
];

const CONDITION_OPTIONS = [
  { value: "new", label: "Brand New" },
  { value: "fairly_used", label: "Fairly Used" },
  { value: "used", label: "Used" },
];

const EMPTY_FORM = { name: "", slug: "", sku: "", description: "", sizeGuide: null, price: "", costPrice: "", priceTiers: null, discountPercent: "", productType: "physical", saleMode: "fixed_price", customerFields: [], condition: "new", stock: "", expiryDate: "", branchStock: {}, categoryId: "", images: [], videoUrl: "", variants: [] };
const EMPTY_CATEGORY = { name: "", slug: "" };
const PRODUCT_FORM_FIELDS = [
  { id: "slug", label: "URL slug" },
  { id: "sku", label: "SKU / barcode" },
  { id: "expiryDate", label: "Expiry date" },
  { id: "costPrice", label: "Cost price" },
  { id: "discount", label: "Discount" },
  { id: "priceTiers", label: "Wholesale tiers" },
  { id: "category", label: "Category" },
  { id: "condition", label: "Condition" },
  { id: "openingStock", label: "Opening stock" },
  { id: "description", label: "Description" },
  { id: "sizeGuide", label: "Size guide" },
  { id: "customerFields", label: "Customer details" },
  { id: "variants", label: "Variants" },
  { id: "photos", label: "Photos" },
  { id: "video", label: "Video" },
];
const DEFAULT_VISIBLE_FORM_FIELDS = PRODUCT_FORM_FIELDS.map((field) => field.id);

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
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [branchCount, setBranchCount] = useState(1);
  const [branches, setBranches] = useState([]);
  // Set only for a branch-scoped staff member - they stock their own
  // branch, not the whole list (which they can't see).
  const [myBranch, setMyBranch] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [visibleFormFields, setVisibleFormFields] = useState(DEFAULT_VISIBLE_FORM_FIELDS);
  const [savingFormPreferences, setSavingFormPreferences] = useState(false);

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
    // Gated on token too, not just storeId - storeId is seeded straight
    // from the ?storeId= param on first render, so without the token
    // check this fires before useAuth has loaded it and the request goes
    // out with no Authorization header, 401s, and (because the catch is
    // silent and the dep list is just [storeId]) never retries - leaving
    // the Category dropdown permanently empty.
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
    // A brand-new product only ever starts stocked at the store's
    // default branch (see seedBranchStockForNewItem in lib/inventory.js)
    // - once there's more than one branch, the plain Stock field below
    // would silently mean "the default branch only", which is confusing
    // enough to just disable in favor of allocating stock per branch
    // after creating the product.
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setBranchCount(data.branchCount || 1);
        setBranches(Array.isArray(data.branches) ? data.branches : []);
        setMyBranch(data.myBranch || null);
      })
      .catch(() => {});
    apiFetch(`/api/v1/vendor/stores/${storeId}/product-form-preferences`)
      .then((data) => {
        if (data.preference && Array.isArray(data.preference.visibleFields)) {
          setVisibleFormFields(data.preference.visibleFields);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const hasField = (field) => visibleFormFields.includes(field);
  const toggleFormField = async (field) => {
    const next = hasField(field) ? visibleFormFields.filter((value) => value !== field) : [...visibleFormFields, field];
    setVisibleFormFields(next);
    setSavingFormPreferences(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/product-form-preferences`, {
        method: "PATCH",
        body: JSON.stringify({ visibleFields: next, sectionOrder: [], collapsedSections: [] }),
      });
    } catch (err) {
      setVisibleFormFields(visibleFormFields);
      toast.error(err.message || "Could not save form preference");
    } finally {
      setSavingFormPreferences(false);
    }
  };

  const categoryOptions = [{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];

  // Images are uploaded to storage immediately (same as the edit page's
  // grid), but since there's no product row yet to PATCH, they just
  // accumulate in local form state and go out together with the create
  // POST below - no separate "add photos after creating" detour.
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const videoSlot = form.videoUrl || uploadingVideo ? 1 : 0;
    const room = MAX_MEDIA - form.images.length - pendingUploads.length - videoSlot;
    if (room <= 0) {
      toast.error(`You can only have up to ${MAX_MEDIA} photos and video combined`);
      return;
    }

    const toUpload = files.slice(0, room);
    if (files.length > toUpload.length) toast.error(`Only added ${toUpload.length} - max ${MAX_MEDIA} photos and video combined`);
    if (toUpload.length === 0) return;

    const entries = toUpload.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, localUrl: URL.createObjectURL(file) }));
    setPendingUploads((p) => [...p, ...entries]);

    await Promise.all(
      entries.map(async (entry) => {
        try {
          const url = await uploadFile(token, entry.file, "product-image");
          setForm((f) => ({ ...f, images: [...f.images, url] }));
        } catch (err) {
          if (err.status === 402) setStorageDialogOpen(true);
          else toast.error(err.message || "Upload failed");
        } finally {
          URL.revokeObjectURL(entry.localUrl);
          setPendingUploads((p) => p.filter((e2) => e2.key !== entry.key));
        }
      }),
    );
  };

  const removeImage = (url) => {
    setForm((f) => ({ ...f, images: f.images.filter((i) => i !== url) }));
    // The image is already live in storage the moment it uploads (see
    // handleImageUpload above) - there's no product row yet to PATCH, so
    // unlike the edit page, nothing else will ever clean this up if it's
    // removed before the product is actually created.
    deleteUploadedFile(token, url);
  };

  // Same "uploads immediately, accumulates in local form state" shape as
  // photos, plus a client-side duration check before any bytes go out -
  // see getVideoDuration's own comment for why this isn't a hard limit.
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (form.images.length + pendingUploads.length >= MAX_MEDIA) {
      toast.error(`You can only have up to ${MAX_MEDIA} photos and video combined`);
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      toast.error(`Video must be smaller than ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`);
      return;
    }

    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) {
        toast.error(`Video must be ${MAX_VIDEO_SECONDS} seconds or shorter (this one is ${Math.round(duration)}s)`);
        return;
      }
    } catch {
      toast.error("Could not read that video file");
      return;
    }

    setUploadingVideo(true);
    try {
      const url = await uploadFile(token, file, "product-video");
      setForm((f) => ({ ...f, videoUrl: url }));
    } catch (err) {
      if (err.status === 402) setStorageDialogOpen(true);
      else toast.error(err.message || "Upload failed");
    } finally {
      setUploadingVideo(false);
    }
  };

  const removeVideo = () => {
    if (form.videoUrl) deleteUploadedFile(token, form.videoUrl);
    setForm((f) => ({ ...f, videoUrl: "" }));
  };

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
    if (uploadingVideo) {
      toast.error("Wait for the video upload to finish");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        price: form.saleMode === "invoice_required" ? 0 : Number(form.price),
        productType: form.productType,
        saleMode: form.saleMode,
        customerFields: form.customerFields,
        condition: form.condition,
        images: form.images,
        variants: form.variants,
      };
      if (myBranch) {
        const s = form.branchStock[myBranch.id];
        if (s !== "" && s != null) payload.branchStock = [{ branchId: myBranch.id, stock: Number(s) }];
      } else if (branchCount > 1 && branches.length > 0) {
        const bs = branches
          .map((b) => ({ branchId: b.id, stock: form.branchStock[b.id] }))
          .filter((x) => x.stock !== "" && x.stock != null)
          .map((x) => ({ branchId: x.branchId, stock: Number(x.stock) }));
        if (bs.length) payload.branchStock = bs;
      } else if (form.stock !== "") {
        payload.stock = Number(form.stock);
      }
      if (form.categoryId) payload.categoryId = form.categoryId;
      if (form.sku) payload.sku = form.sku;
      if (form.expiryDate) payload.expiryDate = form.expiryDate;
      if (form.description) payload.description = form.description;
      const sg = normalizeSizeGuide(form.sizeGuide);
      if (sg) payload.sizeGuide = sg;
      if (form.discountPercent !== "") payload.discountPercent = Number(form.discountPercent);
      if (form.costPrice !== "") payload.costPrice = Number(form.costPrice);
      const tiers = (form.priceTiers || [])
        .filter((t) => t.bundleQty !== "" && t.unitPrice !== "")
        .map((t) => ({ bundleQty: Number(t.bundleQty), unitPrice: Number(t.unitPrice) }))
        .filter((t) => t.bundleQty >= 2 && t.unitPrice > 0)
        .sort((a, b) => a.bundleQty - b.bundleQty);
      if (tiers.length) payload.priceTiers = tiers;
      if (form.videoUrl) payload.videoUrl = form.videoUrl;

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
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <BackLink href="/vendor/products" label="Back to products" />
      <h1 className="text-xl font-bold text-slate-900">Add product</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <form onSubmit={handleCreate} className={`${hasField("category") ? "lg:col-span-2" : "lg:col-span-3"} bg-surface border border-slate-200 rounded-sm p-5 space-y-4`}>
          {stores.length > 1 && (
            <div className="max-w-xs">
              <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
            </div>
          )}

          <ProductFormFieldsButton
            fields={PRODUCT_FORM_FIELDS}
            visibleFields={visibleFormFields}
            onToggle={toggleFormField}
            saving={savingFormPreferences}
          />

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
            <Select label="Selling method" options={SALE_MODE_OPTIONS} value={form.saleMode} onChange={(v) => setForm((f) => ({ ...f, saleMode: v, price: v === "invoice_required" ? "" : f.price, discountPercent: v === "invoice_required" ? "" : f.discountPercent, priceTiers: v === "invoice_required" ? null : f.priceTiers }))} />
            {form.saleMode === "fixed_price" && <PriceInput label="Price" placeholder="0.00" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} required />}
            <Select label="Type" options={PRODUCT_TYPE_OPTIONS} value={form.productType} onChange={(v) => setForm((f) => ({ ...f, productType: v }))} />
            {hasField("condition") && form.productType === "physical" && (
              <Select label="Condition" options={CONDITION_OPTIONS} value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />
            )}
          </div>

          {hasField("variants") && <NewProductVariantsEditor
            value={form.variants}
            invoiceRequired={form.saleMode === "invoice_required"}
            onChange={(variants) => setForm((f) => ({ ...f, variants }))}
          />}

          {hasField("customerFields") && <CustomerFieldsEditor value={form.customerFields} onChange={(customerFields) => setForm((f) => ({ ...f, customerFields }))} />}

          <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasField("slug") && <Input
                  label="URL slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                />}
                {hasField("sku") && <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input label="SKU / barcode" placeholder="e.g. RTB-001" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
                  </div>
                  <BarcodeScanButton onScan={(code) => setForm((f) => ({ ...f, sku: code }))} />
                </div>}
                {hasField("expiryDate") && form.productType === "physical" && (
                  <Input
                    type="date"
                    label="Expiry / use-by date (optional)"
                    value={form.expiryDate}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  />
                )}
                {hasField("openingStock") && form.productType === "physical" &&
                  (myBranch ? (
                    <div>
                      <label className="text-sm font-medium text-slate-700">Opening stock, {myBranch.name}</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={form.branchStock[myBranch.id] ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, branchStock: { ...f.branchStock, [myBranch.id]: e.target.value } }))
                        }
                        className="mt-1 block w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                      />
                      <p className="mt-1 text-xs text-slate-800">Stock is added to your branch.</p>
                    </div>
                  ) : branchCount > 1 && branches.length > 0 ? (
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Opening stock by branch</label>
                      <div className="mt-1.5 space-y-2">
                        {branches.map((b) => (
                          <div key={b.id} className="flex items-center gap-3">
                            <span className="flex-1 truncate text-sm text-slate-600">
                              {b.name}
                              {b.isDefault ? " (default)" : ""}
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={form.branchStock[b.id] ?? ""}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, branchStock: { ...f.branchStock, [b.id]: e.target.value } }))
                              }
                              className="w-24 rounded-sm border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-800">Blank counts as 0. You can adjust these anytime from the product page.</p>
                    </div>
                  ) : (
                    <div>
                      <Input
                        label="Stock"
                        type="number"
                        min="0"
                        value={form.stock}
                        onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                        disabled={branchCount > 1}
                      />
                      {branchCount > 1 && <p className="text-xs font-medium text-amber-600 mt-1">Set per branch after creating.</p>}
                    </div>
                  ))}
                {hasField("category") && <Select label="Category" options={categoryOptions} value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />}
                {hasField("discount") && form.saleMode === "fixed_price" && <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-slate-700">Discount %</label>
                    <InfoTip>Reduces what&apos;s actually charged, e.g. a ₦5,000 product with a 20% discount charges ₦4,000 and shows &ldquo;was ₦5,000, now ₦4,000&rdquo;. Leave blank for no discount.</InfoTip>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    placeholder="0"
                    value={form.discountPercent}
                    onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                  />
                </div>}
                {hasField("costPrice") && <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-slate-700">Cost price</label>
                    <InfoTip>What you paid for it. Only you see this, it&apos;s used for profit/margin figures, never shown to customers.</InfoTip>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.costPrice}
                    onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  />
                  {form.costPrice !== "" && form.price !== "" && Number(form.price) > 0 && (
                    <p className="text-xs text-slate-800 mt-1">
                      Margin {formatCurrency(Number(form.price) - Number(form.costPrice))} (
                      {Math.round(((Number(form.price) - Number(form.costPrice)) / Number(form.price)) * 100)}%)
                    </p>
                  )}
                </div>}
              </div>
              {hasField("priceTiers") && form.saleMode === "fixed_price" && <WholesaleTierEditor value={form.priceTiers} onChange={(v) => setForm((f) => ({ ...f, priceTiers: v }))} />}
              {hasField("description") && <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
              {hasField("sizeGuide") && <SizeGuideEditor value={form.sizeGuide} onChange={(v) => setForm((f) => ({ ...f, sizeGuide: v }))} />}
          </div>

          {hasField("photos") && <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Photos</label>
            <p className="text-xs text-slate-800">
              Drag to reorder - the first photo is the cover shown in your store. Up to {MAX_MEDIA} photos and video combined.
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
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-neutral-900/80 text-white text-[10px] font-medium">
                      Cover
                    </span>
                  )}
                  {/* Grip handle is a hover-only desktop drag hint (fine to
                      lose on touch, dragging itself is desktop-only), but
                      the remove button must stay visible unconditionally -
                      group-hover never fires on touch devices, which made
                      this untappable on phones/tablets. */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
                    <GripVertical size={16} className="absolute top-1 left-1 text-white drop-shadow opacity-0 group-hover:opacity-100" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <X size={12} />
                  </button>
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

              {form.images.length + pendingUploads.length + (form.videoUrl || uploadingVideo ? 1 : 0) < MAX_MEDIA && (
                <label className="w-24 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                  <ImagePlus size={20} />
                  <span className="text-[11px] font-medium">Add photos</span>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>}

          {hasField("video") && <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-medium text-slate-700">Video (optional)</label>
              <InfoTip>A short clip of the product - up to {MAX_VIDEO_SECONDS}s and {MAX_VIDEO_SIZE / (1024 * 1024)}MB.</InfoTip>
            </div>
            {form.videoUrl ? (
              <div className="relative w-40">
                <video src={form.videoUrl} controls className="w-40 rounded-sm border border-slate-200" />
                <button
                  type="button"
                  onClick={removeVideo}
                  aria-label="Remove video"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ) : uploadingVideo ? (
              <div className="w-40 h-24 rounded-sm border border-slate-200 flex items-center justify-center bg-slate-50">
                <Loader2 size={20} className="text-slate-400 animate-spin" />
              </div>
            ) : form.images.length + pendingUploads.length < MAX_MEDIA ? (
              <label className="w-40 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                <Video size={20} />
                <span className="text-[11px] font-medium">Add video</span>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoUpload} className="hidden" />
              </label>
            ) : (
              <p className="text-xs text-slate-800">Remove a photo to make room for a video.</p>
            )}
          </div>}

          <Button type="submit" loading={submitting || uploadingVideo} disabled={pendingUploads.length > 0 || uploadingVideo} fullWidth>Create product</Button>
        </form>

        {hasField("category") && <form onSubmit={handleAddCategory} className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
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
        </form>}
      </div>

      <StorageLimitDialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} />
    </div>
  );
}
