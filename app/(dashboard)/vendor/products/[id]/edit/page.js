"use client";
import { use, useEffect, useRef, useState } from "react";
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
import { StorageLimitDialog } from "@/components/ui/StorageLimitDialog.js";
import { BranchStockPanel } from "@/components/ui/BranchStockPanel.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { uploadFile, getVideoDuration } from "@/lib/clientUpload.js";
import { X, Trash2, ImagePlus, Loader2, GripVertical, Video } from "lucide-react";

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

const PRODUCT_TYPE_OPTIONS = [
  { value: "physical", label: "Physical (needs shipping)" },
  { value: "digital", label: "Digital (no shipping)" },
];

const CONDITION_OPTIONS = [
  { value: "new", label: "Brand New" },
  { value: "fairly_used", label: "Fairly Used" },
  { value: "used", label: "Used" },
];

const STATUS_OPTIONS = [
  { value: "true", label: "Live (visible in store)" },
  { value: "false", label: "Hidden (draft)" },
];

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

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/categories`),
    ])
      .then(([{ product }, categoriesData]) => {
        imagesRef.current = product.images || [];
        setForm({
          name: product.name,
          slug: product.slug,
          sku: product.sku || "",
          description: product.description || "",
          price: String(product.price),
          discountPercent: product.discountPercent != null ? String(product.discountPercent) : "",
          productType: product.productType,
          condition: product.condition,
          stock: product.stock != null ? String(product.stock) : "",
          categoryId: product.categoryId || "",
          images: product.images || [],
          videoUrl: product.videoUrl || "",
          isActive: product.isActive,
        });
        setSuspension(product.suspendedAt ? { reason: product.suspendedReason } : null);
        setCategories(categoriesData.categories);
      })
      .catch((err) => toast.error(err.message || "Failed to load product"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

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

    const room = MAX_IMAGES - imagesRef.current.length - pendingUploads.length;
    if (room <= 0) {
      toast.error(`You can only have up to ${MAX_IMAGES} photos`);
      return;
    }

    const oversized = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (oversized.length > 0) toast.error(`${oversized.length} photo${oversized.length === 1 ? "" : "s"} skipped - each must be under 1MB`);
    const sized = files.filter((f) => f.size <= MAX_IMAGE_SIZE);

    const toUpload = sized.slice(0, room);
    if (sized.length > toUpload.length) toast.error(`Only added ${toUpload.length} - max ${MAX_IMAGES} photos per product`);
    if (toUpload.length === 0) return;

    const entries = toUpload.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, localUrl: URL.createObjectURL(file) }));
    setPendingUploads((p) => [...p, ...entries]);

    // Uploads run in parallel, but each one appends to imagesRef.current
    // (the latest known list) and immediately persists that - so two
    // photos finishing back-to-back can't stomp on each other the way
    // they would if both read a stale form.images from their own closure.
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const url = await uploadFile(token, entry.file, "product-image");
          await persistImages([...imagesRef.current, url]);
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
      await persistVideo(url);
    } catch (err) {
      if (err.status === 402) setStorageDialogOpen(true);
      else toast.error(err.message || "Upload failed");
    } finally {
      setUploadingVideo(false);
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
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        sku: form.sku || undefined,
        price: Number(form.price),
        discountPercent: form.discountPercent !== "" ? Number(form.discountPercent) : null,
        productType: form.productType,
        condition: form.condition,
        categoryId: form.categoryId || undefined,
        description: form.description || undefined,
        images: form.images,
        isActive: form.isActive === true || form.isActive === "true",
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

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <BackLink href={`/vendor/products/${id}?storeId=${storeId}`} label="Back to product" />
      <h1 className="text-xl font-bold text-slate-900">Edit product</h1>

      {suspension && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <p className="font-medium">Suspended by admin</p>
          <p>{suspension.reason || "No reason given."} It won&apos;t show on your storefront until an admin lifts the suspension - changing it to Live here won&apos;t override it.</p>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input label="URL slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
          <Input label="SKU (optional)" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          <PriceInput label="Price" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} required />
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium text-slate-700">Discount %</label>
              <InfoTip>Reduces what's actually charged, e.g. a ₦5,000 product with a 20% discount charges ₦4,000 and shows "was ₦5,000, now ₦4,000". Leave blank for no discount.</InfoTip>
            </div>
            <Input
              type="number"
              min="1"
              max="99"
              placeholder="0"
              value={form.discountPercent}
              onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
            />
          </div>
          <Select label="Type" options={PRODUCT_TYPE_OPTIONS} value={form.productType} onChange={(v) => setForm((f) => ({ ...f, productType: v }))} />
          {form.productType === "physical" && (
            <>
              <Select label="Condition" options={CONDITION_OPTIONS} value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />
              <div>
                <Input
                  label="Stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  disabled={branchCount > 1}
                />
                {branchCount > 1 && <p className="text-xs font-medium text-amber-600 mt-1">Use Stock by branch below instead.</p>}
              </div>
            </>
          )}
          <Select label="Category" options={categoryOptions} value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={String(form.isActive)}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v === "true" }))}
          />
        </div>

        <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

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

            {form.images.length + pendingUploads.length < MAX_IMAGES && (
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
        </div>

        <div className="space-y-2">
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
          ) : (
            <label className="w-40 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
              <Video size={20} />
              <span className="text-[11px] font-medium">Add video</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoUpload} className="hidden" />
            </label>
          )}
        </div>

        <Button type="submit" loading={saving} disabled={pendingUploads.length > 0} fullWidth>Save changes</Button>
      </form>

      <BranchStockPanel storeId={storeId} productId={id} apiFetch={apiFetch} onTotalBranches={setBranchCount} />

      <VariantsManager storeId={storeId} productId={id} apiFetch={apiFetch} branchCount={branchCount} />

      <StorageLimitDialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} />
    </div>
  );
}

const EMPTY_VARIANT_FORM = { optionName: "", optionValue: "", sku: "", price: "", stock: "" };

// A product either sells as-is (this list stays empty) or through
// variants - once any variant exists, the storefront requires picking
// one before add-to-cart, and each variant's own price/stock is what
// actually gets sold (see lib/db/schema.js).
function VariantsManager({ storeId, productId, apiFetch, branchCount }) {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_VARIANT_FORM);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`)
      .then((data) => setVariants(data.variants))
      .catch((err) => toast.error(err.message || "Failed to load variants"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, productId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const payload = { options: { [form.optionName]: form.optionValue } };
      if (form.sku) payload.sku = form.sku;
      if (form.price !== "") payload.price = Number(form.price);
      if (form.stock !== "" && branchCount <= 1) payload.stock = Number(form.stock);
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`, { method: "POST", body: JSON.stringify(payload) });
      setForm(EMPTY_VARIANT_FORM);
      toast.success("Variant added");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to add variant");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (variantId) => {
    setDeletingId(variantId);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants/${variantId}`, { method: "DELETE" });
      setVariants((v) => v.filter((x) => x.id !== variantId));
    } catch (err) {
      toast.error(err.message || "Failed to remove variant");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700">Variants</p>
        <p className="text-xs text-slate-500">
          e.g. Size: Large, Color: Red - each with its own price/stock. Leave
          empty to sell this product as-is. Adding variants doesn&apos;t
          replace the product&apos;s own price/stock above - customers can
          still buy it as &quot;Standard&quot; alongside whatever variants
          you add.
        </p>
      </div>

      {!loading && variants.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {variants.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 text-sm"
            >
              <div>
                <p className="text-slate-900">
                  {Object.entries(v.options)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(", ")}
                </p>
                <p className="text-xs text-slate-500">
                  {v.sku && `SKU ${v.sku} · `}
                  {v.price != null
                    ? `₦${v.price}`
                    : "uses product price"} ·{" "}
                  {v.stock != null ? `${v.stock} in stock` : "no stock limit"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(v.id)}
                disabled={deletingId === v.id}
                className="text-slate-700 hover:text-red-600 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end"
      >
        <Input
          label="Option name"
          placeholder="Size"
          value={form.optionName}
          onChange={(e) =>
            setForm((f) => ({ ...f, optionName: e.target.value }))
          }
          required
        />
        <Input
          label="Value"
          placeholder="Large"
          value={form.optionValue}
          onChange={(e) =>
            setForm((f) => ({ ...f, optionValue: e.target.value }))
          }
          required
        />
        <Input
          label="SKU"
          value={form.sku}
          onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
        />
        <PriceInput
          label="Price override"
          value={form.price}
          onChange={(v) => setForm((f) => ({ ...f, price: v }))}
        />
        <Input
          label="Stock"
          type="number"
          min="0"
          value={form.stock}
          onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
          disabled={branchCount > 1}
          placeholder={branchCount > 1 ? "Set per branch after adding" : undefined}
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          loading={adding}
          className="col-span-2 sm:col-span-1 w-fit"
        >
          Save variant
        </Button>
      </form>
    </div>
  );
}
