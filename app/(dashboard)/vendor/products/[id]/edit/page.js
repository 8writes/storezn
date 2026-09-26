"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { BarcodeScanButton } from "@/components/pos/BarcodeScanButton.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { WholesaleTierEditor } from "@/components/ui/WholesaleTierEditor.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { SizeGuideEditor, normalizeSizeGuide } from "@/components/ui/SizeGuideEditor.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { FormSection } from "@/components/ui/FormSection.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { StorageLimitDialog } from "@/components/ui/StorageLimitDialog.js";
import { BranchStockPanel } from "@/components/ui/BranchStockPanel.js";
import { CustomerFieldsEditor } from "@/components/ui/CustomerFieldsEditor.js";
import { ProductFormFieldsButton } from "@/components/ui/ProductFormFieldsButton.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import {
  uploadFile,
  validateVideoDuration,
  validateProductImageFile,
  validateProductVideoFile,
  PRODUCT_VIDEO_MAX_SECONDS,
  formatUploadSize,
} from "@/lib/clientUpload.js";
import { PRODUCT_VIDEO_MAX_BYTES } from "@/lib/mediaValidation.js";
import { formatCurrency } from "@/lib/format.js";
import { X, Trash2, ImagePlus, Loader2, GripVertical, Video, Pencil, Check, ChevronDown, ChevronUp } from "lucide-react";

// Photos and video share one combined cap - a video eats one of the 10
// slots, same as a photo would.
const MAX_MEDIA = 10;

const PRODUCT_TYPE_OPTIONS = [
  { value: "physical", label: "Physical (needs shipping)" },
];

// { value: "digital", label: "Digital (no shipping)" },

const CONDITION_OPTIONS = [
  { value: "new", label: "Brand New" },
  { value: "fairly_used", label: "Fairly Used" },
  { value: "used", label: "Used" },
];

const STATUS_OPTIONS = [
  { value: "true", label: "Live (visible in store)" },
  { value: "false", label: "Hidden (draft)" },
];

const SALE_MODE_OPTIONS = [
  { value: "fixed_price", label: "Fixed price" },
  { value: "invoice_required", label: "Request invoice (price agreed later)" },
];

const PRODUCT_FORM_FIELDS = [
  { id: "slug", label: "URL slug" }, { id: "sku", label: "SKU / barcode" }, { id: "expiryDate", label: "Expiry date" },
  { id: "costPrice", label: "Cost price" }, { id: "discount", label: "Discount" },
  { id: "priceTiers", label: "Wholesale tiers" }, { id: "category", label: "Category" },
  { id: "condition", label: "Condition" }, { id: "openingStock", label: "Opening stock" }, { id: "description", label: "Description" },
  { id: "sizeGuide", label: "Size guide" }, { id: "customerFields", label: "Customer details" },
  { id: "photos", label: "Photos" }, { id: "video", label: "Video" }, { id: "variants", label: "Variants" },
];
const DEFAULT_VISIBLE_FORM_FIELDS = PRODUCT_FORM_FIELDS.map((field) => field.id);

export default function VendorProductEditPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId");
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [suspension, setSuspension] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  // Concurrent uploads each need to append to the *latest* images list,
  // not whatever `form.images` their closure captured when they started -
  // a ref sidesteps that race without smuggling the PATCH network call
  // inside a setState updater (which React may invoke more than once).
  const imagesRef = useRef([]);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  // Reported up by BranchStockPanel once it knows the store's real branch
  // count (see its own totalBranches, which stays store-wide even for a
  // branch-scoped staff member whose own view is filtered to one row) -
  // >1 means the plain Stock field below is redundant/ambiguous (which
  // branch would it even mean?), so it's disabled in favor of the panel.
  const [branchCount, setBranchCount] = useState(1);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadStatus, setVideoUploadStatus] = useState("");
  const [videoUploadProgress, setVideoUploadProgress] = useState(null);
  const [visibleFormFields, setVisibleFormFields] = useState(DEFAULT_VISIBLE_FORM_FIELDS);
  const [savingFormPreferences, setSavingFormPreferences] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/categories`),
      apiFetch(`/api/v1/vendor/stores/${storeId}`),
    ])
      .then(([{ product }, categoriesData, storeData]) => {
        imagesRef.current = product.images || [];
        setForm({
          name: product.name,
          slug: product.slug,
          sku: product.sku || "",
          description: product.description || "",
          sizeGuide: product.sizeGuide || null,
          price: String(product.price),
          saleMode: product.saleMode || "fixed_price",
          customerFields: Array.isArray(product.customerFields) ? product.customerFields : [],
          discountPercent: product.discountPercent != null ? String(product.discountPercent) : "",
          costPrice: product.costPrice != null ? String(product.costPrice) : "",
          priceTiers: Array.isArray(product.priceTiers) ? product.priceTiers : null,
          productType: product.productType,
          condition: product.condition,
          stock: product.stock != null ? String(product.stock) : "",
          expiryDate: product.expiryDate || "",
          categoryId: product.categoryId || "",
          images: product.images || [],
          videoUrl: product.videoUrl || "",
          isActive: product.isActive,
          allowStandardVariant: product.allowStandardVariant ?? true,
        });
        setSuspension(product.suspendedAt ? { reason: product.suspendedReason } : null);
        setCategories(categoriesData.categories);
        setBranchCount(storeData.branchCount || 1);
      })
      .catch((err) => toast.error(err.message || "Failed to load product"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/product-form-preferences`)
      .then((data) => {
        if (data.preference && Array.isArray(data.preference.visibleFields)) setVisibleFormFields(data.preference.visibleFields);
      })
      .catch(() => {});
  }, [token, storeId, apiFetch]);

  const hasField = (fieldId) => visibleFormFields.includes(fieldId);
  const toggleFormField = async (fieldId) => {
    const previous = visibleFormFields;
    const next = hasField(fieldId) ? visibleFormFields.filter((id2) => id2 !== fieldId) : [...visibleFormFields, fieldId];
    setVisibleFormFields(next);
    setSavingFormPreferences(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/product-form-preferences`, { method: "PATCH", body: JSON.stringify({ visibleFields: next }) });
    } catch (err) {
      setVisibleFormFields(previous);
      toast.error(err.message || "Could not save form preferences");
    } finally {
      setSavingFormPreferences(false);
    }
  };

  // Every photo action (add/remove/reorder) saves straight to the product,
  // rather than only touching local form state and waiting for the
  // separate "Save changes" button below - a photo that visibly appears
  // in the grid otherwise looks saved even though a refresh would lose
  // it, same trap the store logo/favicon upload had.
  const persistImages = async (images) => {
    imagesRef.current = images;
    setForm((f) => ({ ...f, images }));
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`, { method: "PATCH", body: JSON.stringify({ images }) });
    } catch (err) {
      toast.error(err.message || "Failed to save photos");
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const videoSlot = form.videoUrl || uploadingVideo ? 1 : 0;
    const room = MAX_MEDIA - imagesRef.current.length - pendingUploads.length - videoSlot;
    if (room <= 0) {
      toast.error(`You can only have up to ${MAX_MEDIA} photos and video combined`);
      return;
    }

    const validFiles = [];
    for (const file of files) {
      const validation = validateProductImageFile(file);
      if (!validation.ok) {
        toast.error(`${file.name}: ${validation.error}`);
        continue;
      }
      validFiles.push(file);
    }

    const toUpload = validFiles.slice(0, room);
    if (validFiles.length > toUpload.length) toast.error(`Only added ${toUpload.length} - max ${MAX_MEDIA} photos and video combined`);
    if (toUpload.length === 0) return;

    const entries = toUpload.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, localUrl: URL.createObjectURL(file), status: "Preparing image...", progress: null }));
    setPendingUploads((p) => [...p, ...entries]);

    for (const entry of entries) {
      const updateEntry = (patch) => setPendingUploads((p) => p.map((e2) => (e2.key === entry.key ? { ...e2, ...patch } : e2)));
      try {
        const url = await uploadFile(token, entry.file, "product-image", {
          onStatus: (status) => updateEntry({ status }),
          onProgress: (progress) => updateEntry({ progress }),
        });
        await persistImages([...imagesRef.current, url]);
      } catch (err) {
        if (err.status === 402) setStorageDialogOpen(true);
        else toast.error(`${entry.file.name}: ${err.message || "Upload failed"}`);
      } finally {
        URL.revokeObjectURL(entry.localUrl);
        setPendingUploads((p) => p.filter((e2) => e2.key !== entry.key));
      }
    }
  };

  const removeImage = (url) => persistImages(imagesRef.current.filter((i) => i !== url));

  // Same "saves straight to the product" immediacy as photos above - a
  // video that visibly appears otherwise looks saved even though a
  // refresh would lose it if left only in local form state.
  const persistVideo = async (videoUrl) => {
    setForm((f) => ({ ...f, videoUrl }));
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`, { method: "PATCH", body: JSON.stringify({ videoUrl }) });
    } catch (err) {
      toast.error(err.message || "Failed to save video");
    }
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (imagesRef.current.length + pendingUploads.length >= MAX_MEDIA) {
      toast.error(`You can only have up to ${MAX_MEDIA} photos and video combined`);
      return;
    }

    const fileValidation = validateProductVideoFile(file);
    if (!fileValidation.ok) {
      toast.error(fileValidation.error);
      return;
    }

    setVideoUploadStatus("Checking video...");
    setVideoUploadProgress(null);
    setUploadingVideo(true);
    try {
      const durationValidation = await validateVideoDuration(file);
      if (!durationValidation.ok) {
        toast.error(durationValidation.error);
        setVideoUploadStatus("");
        setUploadingVideo(false);
        return;
      }
    } catch {
      toast.error("Could not read that video file");
      setVideoUploadStatus("");
      setUploadingVideo(false);
      return;
    }

    try {
      const url = await uploadFile(token, file, "product-video", {
        onStatus: setVideoUploadStatus,
        onProgress: setVideoUploadProgress,
      });
      await persistVideo(url);
    } catch (err) {
      if (err.status === 402) setStorageDialogOpen(true);
      else toast.error(err.message || "Upload failed");
    } finally {
      setUploadingVideo(false);
      setVideoUploadStatus("");
      setVideoUploadProgress(null);
    }
  };

  const removeVideo = () => persistVideo("");

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const images = [...imagesRef.current];
    const [moved] = images.splice(dragIndex, 1);
    images.splice(dropIndex, 0, moved);
    setDragIndex(null);
    persistImages(images);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (pendingUploads.length > 0) {
      toast.error("Wait for photo uploads to finish");
      return;
    }
    if (uploadingVideo) {
      toast.error("Wait for the video upload to finish");
      return;
    }
    const cleanTiers = (form.priceTiers || [])
      .filter((t) => t.bundleQty !== "" && t.unitPrice !== "")
      .map((t) => ({ bundleQty: Number(t.bundleQty), unitPrice: Number(t.unitPrice) }))
      .filter((t) => t.bundleQty >= 2 && t.unitPrice > 0)
      .sort((a, b) => a.bundleQty - b.bundleQty);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        sku: form.sku || undefined,
        price: form.saleMode === "invoice_required" ? 0 : Number(form.price),
        saleMode: form.saleMode,
        customerFields: form.customerFields,
        discountPercent: form.saleMode === "invoice_required" ? null : (form.discountPercent !== "" ? Number(form.discountPercent) : null),
        costPrice: form.costPrice !== "" ? Number(form.costPrice) : null,
        priceTiers: form.saleMode === "invoice_required" ? null : (cleanTiers.length ? cleanTiers : null),
        productType: form.productType,
        condition: form.condition,
        categoryId: form.categoryId || null,
        expiryDate: form.expiryDate || null,
        description: form.description || undefined,
        sizeGuide: normalizeSizeGuide(form.sizeGuide),
        images: form.images,
        isActive: form.isActive === true || form.isActive === "true",
        allowStandardVariant: form.allowStandardVariant !== false,
      };
      // Disabled (and left out of the payload) once there's more than one
      // branch - form.stock is the store-wide aggregate in that case, not
      // any one branch's number, so submitting it would silently
      // overwrite the default branch with a total that was never really
      // "its" stock. See Stock by branch instead.
      if (form.stock !== "" && branchCount <= 1) payload.stock = Number(form.stock);
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast.success("Product updated");
      router.push(`/vendor/products/${id}?storeId=${storeId}`);
    } catch (err) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="space-y-6">
        <BackLink href={`/vendor/products/${id}?storeId=${storeId}`} label="Back to product" />
        <FormSkeleton fields={6} />
      </div>
    );
  }

  const categoryOptions = [{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <BackLink href={`/vendor/products/${id}?storeId=${storeId}`} label="Back to product" />
      <PageHeader
        title="Edit product"
        description="Update product details, stock settings, variants, media, and customer-facing fields."
      />

      {suspension && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <p className="font-medium">Suspended by admin</p>
          <p>{suspension.reason || "No reason given."} It won&apos;t show on your storefront until an admin lifts the suspension - changing it to Live here won&apos;t override it.</p>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-surface space-y-2">
        <ProductFormFieldsButton
          fields={PRODUCT_FORM_FIELDS}
          visibleFields={visibleFormFields}
          onToggle={toggleFormField}
          saving={savingFormPreferences}
        />
        <FormSection title="Basics" description="Keep the product identity, selling method, price, and status easy to review.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          {hasField("slug") && <Input label="URL slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />}
          {hasField("sku") && <div className="flex items-end gap-2">
            <div className="flex-1"><Input label="SKU / barcode (optional)" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></div>
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
          <Select label="Selling method" options={SALE_MODE_OPTIONS} value={form.saleMode} onChange={(v) => setForm((f) => ({ ...f, saleMode: v, price: v === "invoice_required" ? "" : f.price, discountPercent: v === "invoice_required" ? "" : f.discountPercent, priceTiers: v === "invoice_required" ? null : f.priceTiers }))} />
          {form.saleMode === "fixed_price" && <PriceInput label="Price" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} required />}
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
          <Select label="Type" options={PRODUCT_TYPE_OPTIONS} value={form.productType} onChange={(v) => setForm((f) => ({ ...f, productType: v }))} />
          {form.productType === "physical" && (
            <>
              {hasField("condition") && <Select label="Condition" options={CONDITION_OPTIONS} value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />}
              {hasField("openingStock") && <div>
                <Input
                  label="Stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  disabled={branchCount > 1}
                />
                {branchCount > 1 && <p className="text-xs font-medium text-amber-600 mt-1">Use Stock by branch below instead.</p>}
              </div>}
            </>
          )}
          {hasField("category") && <Select label="Category" options={categoryOptions} value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />}
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={String(form.isActive)}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v === "true" }))}
          />
        </div>
        </FormSection>

        {(hasField("priceTiers") || hasField("description") || hasField("sizeGuide") || hasField("customerFields")) && <FormSection title="Details customers see" description="Add buying guidance, sizing, wholesale tiers, or custom information customers must provide.">
        {hasField("priceTiers") && form.saleMode === "fixed_price" && <WholesaleTierEditor value={form.priceTiers} onChange={(v) => setForm((f) => ({ ...f, priceTiers: v }))} />}

        {hasField("description") && <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
        {hasField("sizeGuide") && <SizeGuideEditor value={form.sizeGuide} onChange={(v) => setForm((f) => ({ ...f, sizeGuide: v }))} />}
        {hasField("customerFields") && <CustomerFieldsEditor value={form.customerFields} onChange={(customerFields) => setForm((f) => ({ ...f, customerFields }))} />}
        </FormSection>}

        {(hasField("photos") || hasField("video")) && <FormSection title="Media" description="Refresh photos and videos without losing the rest of the product edits.">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 px-1 text-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                  <span className="text-[10px] font-medium leading-tight text-white">
                    {entry.status || "Uploading image..."}
                    {entry.progress != null ? ` ${entry.progress}%` : ""}
                  </span>
                </div>
              </div>
            ))}

            {form.images.length + pendingUploads.length + (form.videoUrl || uploadingVideo ? 1 : 0) < MAX_MEDIA && (
              <label className="w-24 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                <ImagePlus size={20} />
                <span className="text-[11px] font-medium">Add photos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>}

        {hasField("video") && <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-slate-700">Video (optional)</label>
            <InfoTip>A short clip of the product - up to {PRODUCT_VIDEO_MAX_SECONDS}s and {formatUploadSize(PRODUCT_VIDEO_MAX_BYTES)}.</InfoTip>
          </div>
          {form.videoUrl ? (
            <div className="relative w-40">
              <video src={form.videoUrl} controls preload="metadata" className="w-40 rounded-sm border border-slate-200" />
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
            <div className="w-40 h-24 rounded-sm border border-slate-200 flex flex-col items-center justify-center gap-1 bg-slate-50 px-2 text-center">
              <Loader2 size={20} className="text-slate-400 animate-spin" />
              <span className="text-[11px] font-medium text-slate-700">
                {videoUploadStatus || "Uploading video..."}
                {videoUploadProgress != null ? ` ${videoUploadProgress}%` : ""}
              </span>
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
        </FormSection>}

        <div className="sticky bottom-0 z-20 -mx-3 -mb-3 flex justify-end border-t border-slate-200 bg-surface/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5">
          <Button type="submit" loading={saving} fullWidth={true} disabled={pendingUploads.length > 0 || uploadingVideo} className="w-full">Save changes</Button>
        </div>
      </form>

      {hasField("openingStock") && <BranchStockPanel storeId={storeId} productId={id} apiFetch={apiFetch} onTotalBranches={setBranchCount} />}

      {hasField("variants") && <VariantsManager
        storeId={storeId}
        productId={id}
        apiFetch={apiFetch}
        branchCount={branchCount}
        standardEnabled={form.allowStandardVariant !== false}
        onToggleStandard={(v) => setForm((f) => ({ ...f, allowStandardVariant: v }))}
      />}

      <StorageLimitDialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} />
    </div>
  );
}

const EMPTY_EDIT_FORM = { price: "", stock: "" };

const parseValues = (s) => [...new Set(s.split(",").map((v) => v.trim()).filter(Boolean))];

// Every combination of the given option dimensions, e.g.
// [{Size:[S,M]},{Colour:[Red]}] -> [{Size:S,Colour:Red},{Size:M,Colour:Red}].
const cartesian = (dims) =>
  dims.reduce((acc, d) => acc.flatMap((combo) => d.values.map((val) => ({ ...combo, [d.name]: val }))), [{}]);

const canonOptions = (options) =>
  JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

// How many variant rows to show before the "Show more" button - products
// with a big Size x Colour grid can run to dozens.
const VARIANT_PAGE = 8;

// A product either sells as-is (this list stays empty) or through
// variants - once any variant exists, the storefront requires picking one
// value from every option dimension before add-to-cart, and each
// variant's own price/stock is what actually gets sold (see
// lib/db/schema.js). The builder below takes 1-3 option dimensions
// (name + comma-separated values each) and creates one variant per
// combination; price and stock are set by editing each variant after.
function VariantsManager({ storeId, productId, apiFetch, branchCount, standardEnabled, onToggleStandard }) {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dims, setDims] = useState([{ name: "", values: "" }]);
  const dimsSeeded = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [togglingStandard, setTogglingStandard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [visible, setVisible] = useState(VARIANT_PAGE);
  const [variantsCollapsed, setVariantsCollapsed] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  useModalScrollLock(variantsOpen);

  useEffect(() => {
    if (!variantsOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !generating && !savingEdit && !bulkDeleting && !togglingStandard && !deletingId) setVariantsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [variantsOpen, generating, savingEdit, bulkDeleting, togglingStandard, deletingId]);

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`)
      .then((data) => {
        setVariants(data.variants);
        setSelected(new Set());
        setVisible(VARIANT_PAGE);
        // Seed the builder from what already exists (once) so "Generate"
        // fills in any missing combinations rather than starting blank.
        if (!dimsSeeded.current && data.variants.length > 0) {
          const byName = {};
          for (const v of data.variants) {
            for (const [k, val] of Object.entries(v.options || {})) {
              (byName[k] = byName[k] || new Set()).add(val);
            }
          }
          const names = Object.keys(byName);
          if (names.length > 0) setDims(names.map((n) => ({ name: n, values: [...byName[n]].join(", ") })));
        }
        dimsSeeded.current = true;
      })
      .catch((err) => toast.error(err.message || "Failed to load variants"))
      .finally(() => setLoading(false));
  };

  const setDim = (i, patch) => setDims((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDim = () => setDims((ds) => [...ds, { name: "", values: "" }]);
  const removeDim = (i) => setDims((ds) => ds.filter((_, j) => j !== i));

  const handleToggleStandard = async () => {
    const next = !standardEnabled;
    setTogglingStandard(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ allowStandardVariant: next }),
      });
      onToggleStandard(next);
      toast.success(next ? "\"Standard\" option shown in your storefront" : "\"Standard\" option hidden - customers must pick an option");
    } catch (err) {
      toast.error(err.message || "Failed to update");
    } finally {
      setTogglingStandard(false);
    }
  };

  useEffect(() => {
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, productId]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    const parsed = dims
      .map((d) => ({ name: d.name.trim(), values: parseValues(d.values) }))
      .filter((d) => d.name || d.values.length > 0);
    if (parsed.length === 0) return;
    if (parsed.some((d) => !d.name || d.values.length === 0)) {
      toast.error("Give every option a name and at least one value");
      return;
    }
    const lowerNames = parsed.map((d) => d.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      toast.error("Option names must be different");
      return;
    }

    const combos = cartesian(parsed);
    const dimNames = parsed.map((d) => d.name);

    // Any existing variant that doesn't carry exactly the current set of
    // option keys can never be selected on the storefront (the picker
    // needs one value per current dimension) - that covers a changed
    // option name and the old single-key rows from before combination
    // variants existed. Rebuild from scratch rather than leave orphans.
    const existingNames = [...new Set(variants.flatMap((v) => Object.keys(v.options || {})))].sort();
    const needsRebuild =
      variants.length > 0 &&
      variants.some((v) => {
        const keys = Object.keys(v.options || {});
        return keys.length !== dimNames.length || !dimNames.every((n) => n in (v.options || {}));
      });

    let toDelete = [];
    if (needsRebuild) {
      const ok = await confirm({
        title: "Rebuild variants?",
        description: `Your ${variants.length} current variant${variants.length === 1 ? "" : "s"} don't match the options "${dimNames.join(", ")}"${existingNames.length ? ` (they use "${existingNames.join(", ")}")` : ""}. They'll be removed and recreated as every combination - any prices/stock you set on them are lost.`,
        confirmLabel: "Rebuild",
        variant: "danger",
      });
      if (!ok) return;
      toDelete = variants.map((v) => v.id);
    }

    setGenerating(true);
    try {
      for (const vid of toDelete) {
        await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants/${vid}`, { method: "DELETE" }).catch(() => {});
      }
      const existingCanon = new Set(needsRebuild ? [] : variants.map((v) => canonOptions(v.options || {})));
      let ok = 0;
      for (const options of combos) {
        if (existingCanon.has(canonOptions(options))) continue;
        try {
          await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`, {
            method: "POST",
            body: JSON.stringify({ options }),
          });
          ok += 1;
        } catch (err) {
          toast.error(`${Object.values(options).join(" / ")}: ${err.message || "failed to add"}`);
        }
      }
      if (ok > 0) toast.success(`${ok} variant${ok === 1 ? "" : "s"} ${needsRebuild ? "created" : "added"}`);
      else if (!needsRebuild) toast.error("Nothing new - those variants already exist");
      setVariantsCollapsed(false);
      load();
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (variantId) => {
    if (editingId === variantId) cancelEdit();
    setDeletingId(variantId);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants/${variantId}`, { method: "DELETE" });
      setVariants((v) => v.filter((x) => x.id !== variantId));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(variantId);
        return n;
      });
    } catch (err) {
      toast.error(err.message || "Failed to remove variant");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelect = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allSelected = variants.length > 0 && selected.size === variants.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(variants.map((v) => v.id)));

  const handleBulkDelete = async (idsArg) => {
    const ids = idsArg || [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Delete ${ids.length} variant${ids.length === 1 ? "" : "s"}?`,
      description: "This can't be undone. Any prices or stock set on them are lost.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      const gone = new Set(ids);
      setVariants((v) => v.filter((x) => !gone.has(x.id)));
      setSelected(new Set());
      if (editingId && gone.has(editingId)) cancelEdit();
      toast.success(`${data.deleted ?? ids.length} variant${(data.deleted ?? ids.length) === 1 ? "" : "s"} deleted`);
    } catch (err) {
      toast.error(err.message || "Failed to delete variants");
    } finally {
      setBulkDeleting(false);
    }
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setEditForm({
      price: v.price != null ? String(v.price) : "",
      stock: v.stock != null ? String(v.stock) : "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_EDIT_FORM);
  };

  const handleSaveEdit = async (variantId) => {
    setSavingEdit(true);
    try {
      const payload = { price: editForm.price !== "" ? Number(editForm.price) : null };
      if (branchCount <= 1 && editForm.stock !== "") payload.stock = Number(editForm.stock);
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants/${variantId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setVariants((vs) => vs.map((x) => (x.id === variantId ? { ...x, ...data.variant } : x)));
      toast.success("Variant updated");
      cancelEdit();
    } catch (err) {
      toast.error(err.message || "Failed to update variant");
    } finally {
      setSavingEdit(false);
    }
  };

  const busy = generating || savingEdit || bulkDeleting || togglingStandard || deletingId !== null;

  return (
    <>
      <div className="flex flex-col gap-3 border border-slate-200 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Variants</p>
          <p className="mt-1 text-xs text-slate-700">{loading ? "Loading variants..." : variants.length > 0 ? `${variants.length} variant${variants.length === 1 ? "" : "s"} configured.` : "Add options such as Size and Colour when this product has choices."}</p>
        </div>
        <Button type="button" onClick={() => setVariantsOpen(true)} disabled={loading} fullWidth className="sm:w-auto">
          {variants.length > 0 ? "Manage variants" : "Add variants"}
        </Button>
      </div>

      {variantsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-none sm:items-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={busy ? undefined : () => setVariantsOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="edit-product-variants-title" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-2xl sm:rounded-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id="edit-product-variants-title" className="font-semibold text-slate-900">Variants</h2>
                <p className="mt-0.5 text-sm text-slate-600">Generate, update, or remove product options.</p>
              </div>
              <button type="button" aria-label="Close variants" disabled={busy} onClick={() => setVariantsOpen(false)} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="space-y-4">

      {!loading && variants.length > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-sm border border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Show a &quot;Standard&quot; option</p>
            <p className="text-xs text-slate-800 mt-0.5">
              {standardEnabled
                ? "Customers can buy the plain product (its own price/stock) alongside the options below."
                : "Customers must pick one of the options below - the plain product isn't offered."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!standardEnabled}
            disabled={togglingStandard}
            onClick={handleToggleStandard}
            className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              standardEnabled ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                standardEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {!loading && variants.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-brand-600" />
            {selected.size > 0 ? `${selected.size} selected` : `${variants.length} variant${variants.length === 1 ? "" : "s"}`}
          </label>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <Button type="button" size="sm" variant="danger" onClick={() => handleBulkDelete()} loading={bulkDeleting}>
                Delete selected
              </Button>
            )}
            <button
              type="button"
              onClick={() => handleBulkDelete(variants.map((v) => v.id))}
              disabled={bulkDeleting}
              className="text-xs font-medium text-slate-800 hover:text-red-600 disabled:opacity-50 cursor-pointer"
            >
              Delete all
            </button>
          </div>
        </div>
      )}

      {!loading && variants.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setVariantsCollapsed((current) => !current)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer sm:w-auto"
          >
            {variantsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {variantsCollapsed ? `Show ${variants.length} variant${variants.length === 1 ? "" : "s"}` : "Collapse variants"}
          </button>
        </div>
      )}

      {!loading && variants.length > 0 && variantsCollapsed && (
        <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-700">
          Variant rows are hidden. Open them when you need to edit price, stock, or delete options.
        </div>
      )}

      {!loading && variants.length > 0 && !variantsCollapsed && (
        <div className="max-h-[34rem] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-sm pr-1">
          {variants.slice(0, visible).map((v) => (
            <div key={v.id} className={`p-3 text-sm ${selected.has(v.id) ? "bg-brand-50" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    className="mt-0.5 accent-brand-600 shrink-0"
                    aria-label="Select variant"
                  />
                  <div className="min-w-0">
                    <p className="text-slate-900">
                      {Object.entries(v.options)
                        .map(([k, val]) => `${k}: ${val}`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-slate-800">
                      {v.sku && `SKU ${v.sku} · `}
                      {v.price != null ? `₦${v.price}` : "uses product price"} ·{" "}
                      {v.stock != null ? `${v.stock} in stock` : "no stock limit"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => (editingId === v.id ? cancelEdit() : startEdit(v))}
                    className="text-slate-800 hover:text-brand-600 cursor-pointer"
                    aria-label="Edit variant"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="text-slate-800 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                    aria-label="Delete variant"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editingId === v.id && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <PriceInput
                    label="Price override"
                    value={editForm.price}
                    onChange={(val) => setEditForm((f) => ({ ...f, price: val }))}
                  />
                  <Input
                    label="Stock"
                    type="number"
                    min="0"
                    value={editForm.stock}
                    onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value }))}
                    disabled={branchCount > 1}
                    placeholder={branchCount > 1 ? "Set per branch" : undefined}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" size="sm" onClick={() => handleSaveEdit(v.id)} loading={savingEdit} className="w-full sm:w-auto">
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={savingEdit} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && variants.length > visible && !variantsCollapsed && (
        <button
          type="button"
          onClick={() => setVisible((n) => n + VARIANT_PAGE)}
          className="text-xs font-medium text-brand-600 hover:underline cursor-pointer"
        >
          Show {Math.min(VARIANT_PAGE, variants.length - visible)} more ({variants.length - visible} hidden)
        </button>
      )}

      {!loading && variants.length > 0 && !variantsCollapsed && (
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
      )}

      <form onSubmit={handleGenerate} className="space-y-3">
        {dims.map((d, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <Input
              label={i === 0 ? "Option name" : undefined}
              placeholder="Size"
              value={d.name}
              onChange={(e) => setDim(i, { name: e.target.value })}
              required
            />
            <Input
              label={i === 0 ? "Values (comma-separated)" : undefined}
              placeholder="Small, Medium, Large"
              value={d.values}
              onChange={(e) => setDim(i, { values: e.target.value })}
              required
            />
            {dims.length > 1 ? (
              <button
                type="button"
                onClick={() => removeDim(i)}
                className="text-slate-800 hover:text-red-600 cursor-pointer pb-2 justify-self-start sm:justify-self-auto"
                aria-label="Remove option"
              >
                <Trash2 size={16} />
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={addDim} className="inline-flex justify-center text-sm font-medium text-brand-600 hover:underline cursor-pointer">
            + Add another option
          </button>
          <Button type="submit" size="sm" variant="primary" loading={generating} className="w-full sm:w-auto">
            Generate variants
          </Button>
        </div>
      </form>
      <p className="text-xs text-slate-800">
        Two options (e.g. Size &times; Colour) creates a variant for every combination. Set each variant&apos;s
        price and stock by editing it below.
      </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </>
  );
}
