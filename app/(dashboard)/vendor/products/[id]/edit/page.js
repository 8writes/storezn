"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
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
import { X, Trash2, ImagePlus, Loader2, GripVertical, Video, Pencil, Check } from "lucide-react";

// Photos and video share one combined cap - a video eats one of the 5
// slots, same as a photo would.
const MAX_MEDIA = 5;
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

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
          sizeGuide: product.sizeGuide || "",
          price: String(product.price),
          discountPercent: product.discountPercent != null ? String(product.discountPercent) : "",
          productType: product.productType,
          condition: product.condition,
          stock: product.stock != null ? String(product.stock) : "",
          categoryId: product.categoryId || "",
          images: product.images || [],
          videoUrl: product.videoUrl || "",
          isActive: product.isActive,
          allowStandardVariant: product.allowStandardVariant ?? true,
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

    const videoSlot = form.videoUrl || uploadingVideo ? 1 : 0;
    const room = MAX_MEDIA - imagesRef.current.length - pendingUploads.length - videoSlot;
    if (room <= 0) {
      toast.error(`You can only have up to ${MAX_MEDIA} photos and video combined`);
      return;
    }

    const oversized = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (oversized.length > 0) toast.error(`${oversized.length} photo${oversized.length === 1 ? "" : "s"} skipped - each must be under 1MB`);
    const sized = files.filter((f) => f.size <= MAX_IMAGE_SIZE);

    const toUpload = sized.slice(0, room);
    if (sized.length > toUpload.length) toast.error(`Only added ${toUpload.length} - max ${MAX_MEDIA} photos and video combined`);
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

    if (imagesRef.current.length + pendingUploads.length >= MAX_MEDIA) {
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
    if (uploadingVideo) {
      toast.error("Wait for the video upload to finish");
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
        categoryId: form.categoryId || null,
        description: form.description || undefined,
        sizeGuide: form.sizeGuide.trim() || null,
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
        <Textarea
          label="Size guide"
          rows={4}
          placeholder={"Shown behind a \"Size guide\" link on the product page.\nS — chest 36-38\"\nM — chest 39-41\""}
          value={form.sizeGuide}
          onChange={(e) => setForm((f) => ({ ...f, sizeGuide: e.target.value }))}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Photos</label>
          <p className="text-xs text-slate-500">
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
          ) : form.images.length + pendingUploads.length < MAX_MEDIA ? (
            <label className="w-40 h-24 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-700 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
              <Video size={20} />
              <span className="text-[11px] font-medium">Add video</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoUpload} className="hidden" />
            </label>
          ) : (
            <p className="text-xs text-slate-500">Remove a photo to make room for a video.</p>
          )}
        </div>

        <Button type="submit" loading={saving} disabled={pendingUploads.length > 0 || uploadingVideo} fullWidth>Save changes</Button>
      </form>

      <BranchStockPanel storeId={storeId} productId={id} apiFetch={apiFetch} onTotalBranches={setBranchCount} />

      <VariantsManager
        storeId={storeId}
        productId={id}
        apiFetch={apiFetch}
        branchCount={branchCount}
        standardEnabled={form.allowStandardVariant !== false}
        onToggleStandard={(v) => setForm((f) => ({ ...f, allowStandardVariant: v }))}
      />

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
  const [togglingStandard, setTogglingStandard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`)
      .then((data) => {
        setVariants(data.variants);
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
    } catch (err) {
      toast.error(err.message || "Failed to remove variant");
    } finally {
      setDeletingId(null);
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
        <div className="flex items-center justify-between gap-4 rounded-sm border border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Show a &quot;Standard&quot; option</p>
            <p className="text-xs text-slate-500 mt-0.5">
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
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                standardEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {!loading && variants.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {variants.map((v) => (
            <div key={v.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-slate-900">
                    {Object.entries(v.options)
                      .map(([k, val]) => `${k}: ${val}`)
                      .join(", ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.sku && `SKU ${v.sku} · `}
                    {v.price != null ? `₦${v.price}` : "uses product price"} ·{" "}
                    {v.stock != null ? `${v.stock} in stock` : "no stock limit"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => (editingId === v.id ? cancelEdit() : startEdit(v))}
                    className="text-slate-500 hover:text-brand-600 cursor-pointer"
                    aria-label="Edit variant"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="text-slate-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
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
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => handleSaveEdit(v.id)} loading={savingEdit}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
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
                className="text-slate-500 hover:text-red-600 cursor-pointer pb-2 justify-self-start sm:justify-self-auto"
                aria-label="Remove option"
              >
                <Trash2 size={16} />
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={addDim} className="text-sm font-medium text-brand-600 hover:underline cursor-pointer">
            + Add another option
          </button>
          <Button type="submit" size="sm" variant="primary" loading={generating} className="w-fit sm:ml-auto">
            Generate variants
          </Button>
        </div>
      </form>
      <p className="text-xs text-slate-500">
        Two options (e.g. Size &times; Colour) creates a variant for every combination. Set each variant&apos;s
        price and stock by editing it below.
      </p>
      {confirmDialog}
    </div>
  );
}
