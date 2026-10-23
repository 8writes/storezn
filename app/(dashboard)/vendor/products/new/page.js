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
import { normalizeSizeGuide } from "@/components/ui/SizeGuideEditor.js";
import { SizeGuideField } from "@/components/ui/SizeGuideField.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSection } from "@/components/ui/FormSection.js";
import { Tabs, TabPanel, useTabs } from "@/components/ui/Tabs.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { Switch } from "@/components/ui/Switch.js";
import { IMAGE_DISCLAIMER_TEXT } from "@/components/storefront/ImageDisclaimerBadge.js";
import { StorageLimitDialog } from "@/components/ui/StorageLimitDialog.js";
import { NewProductVariantsEditor } from "@/components/ui/NewProductVariantsEditor.js";
import { CustomerFieldsEditor } from "@/components/ui/CustomerFieldsEditor.js";
import { ProductFormFieldsButton } from "@/components/ui/ProductFormFieldsButton.js";
import {
  uploadFile,
  deleteUploadedFile,
  validateVideoDuration,
  validateProductImageFile,
  validateProductVideoFile,
} from "@/lib/clientUpload.js";
import { CategoryPicker } from "@/components/ui/CategoryPicker.js";
import { ProductMediaField, MAX_PRODUCT_MEDIA } from "@/components/ui/ProductMediaField.js";
import { slugify } from "@/lib/slugify.js";
import { formatCurrency } from "@/lib/format.js";

// Photos and video share one combined cap - a video eats one of the 10
// slots, same as a photo would.
const MAX_MEDIA = MAX_PRODUCT_MEDIA;

const SALE_MODE_OPTIONS = [
  { value: "fixed_price", label: "Fixed Price" },
  { value: "invoice_required", label: "Request a Quote" },
];

const CONDITION_OPTIONS = [
  { value: "new", label: "Brand New" },
  { value: "fairly_used", label: "Fairly Used" },
  { value: "used", label: "Used" },
];

const EMPTY_FORM = { name: "", slug: "", sku: "", description: "", sizeGuide: null, sizeGuidePresetId: null, price: "", costPrice: "", priceTiers: null, discountPercent: "", productType: "physical", saleMode: "fixed_price", customerFields: [], condition: "new", stock: "", expiryDate: "", branchStock: {}, categoryId: "", images: [], videoUrl: "", imageDisclaimer: false, variants: [] };
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
// Fields that live under the collapsed "More options" section.
const MORE_OPTION_FIELDS = ["variants", "discount", "costPrice", "priceTiers", "customerFields", "sku", "slug", "expiryDate"];

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
  const tabs = useTabs(["details", "photos", "description", "more"]);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [branchCount, setBranchCount] = useState(1);
  const [usdRate, setUsdRate] = useState(null);
  const [branches, setBranches] = useState([]);
  // Set only for a branch-scoped staff member - they stock their own
  // branch, not the whole list (which they can't see).
  const [myBranch, setMyBranch] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadStatus, setVideoUploadStatus] = useState("");
  const [videoUploadProgress, setVideoUploadProgress] = useState(null);
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
        // "≈ $" hints beside prices - only for stores that show dollars.
        setUsdRate(data.store?.internationalPaymentsEnabled ? data.usdRate?.rate || null : null);
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
        body: JSON.stringify({ visibleFields: next }),
      });
    } catch (err) {
      setVisibleFormFields(visibleFormFields);
      toast.error(err.message || "Could not save form preference");
    } finally {
      setSavingFormPreferences(false);
    }
  };

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
        setForm((f) => ({ ...f, images: [...f.images, url] }));
      } catch (err) {
        if (err.status === 402) setStorageDialogOpen(true);
        else toast.error(`${entry.file.name}: ${err.message || "Upload failed"}`);
      } finally {
        URL.revokeObjectURL(entry.localUrl);
        setPendingUploads((p) => p.filter((e2) => e2.key !== entry.key));
      }
    }
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
      setForm((f) => ({ ...f, videoUrl: url }));
    } catch (err) {
      if (err.status === 402) setStorageDialogOpen(true);
      else toast.error(err.message || "Upload failed");
    } finally {
      setUploadingVideo(false);
      setVideoUploadStatus("");
      setVideoUploadProgress(null);
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
      // A saved guide is sent by id (the server copies its table in);
      // otherwise the product's own table, if it has one.
      if (form.sizeGuidePresetId) payload.sizeGuidePresetId = form.sizeGuidePresetId;
      else {
        const sg = normalizeSizeGuide(form.sizeGuide);
        if (sg) payload.sizeGuide = sg;
      }
      if (form.discountPercent !== "") payload.discountPercent = Number(form.discountPercent);
      if (form.costPrice !== "") payload.costPrice = Number(form.costPrice);
      const tiers = (form.priceTiers || [])
        .filter((t) => t.bundleQty !== "" && t.unitPrice !== "")
        .map((t) => ({ bundleQty: Number(t.bundleQty), unitPrice: Number(t.unitPrice) }))
        .filter((t) => t.bundleQty >= 2 && t.unitPrice > 0)
        .sort((a, b) => a.bundleQty - b.bundleQty);
      if (tiers.length) payload.priceTiers = tiers;
      if (form.videoUrl) payload.videoUrl = form.videoUrl;
      if (form.imageDisclaimer) payload.imageDisclaimer = true;

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

  // One section at a time (components/ui/Tabs.js). A tab whose fields are
  // all switched off in "Show / hide fields" is left out.
  const productTabs = [
    { id: "details", label: "Details" },
    ...(hasField("photos") || hasField("video") ? [{ id: "photos", label: "Photos" }] : []),
    ...(hasField("description") || hasField("sizeGuide") ? [{ id: "description", label: "Description" }] : []),
    { id: "more", label: "More options" },
  ];
  const activeTab = productTabs.some((t) => t.id === tabs.active) ? tabs.active : "details";
  const optionalFieldsShown = PRODUCT_FORM_FIELDS.filter((f) => MORE_OPTION_FIELDS.includes(f.id) && hasField(f.id)).length;
  const stockField = hasField("openingStock") && form.productType === "physical" && (
    myBranch ? (
      <Input
        label={`Stock at ${myBranch.name}`}
        type="number"
        min="0"
        placeholder="0"
        value={form.branchStock[myBranch.id] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, branchStock: { ...f.branchStock, [myBranch.id]: e.target.value } }))}
      />
    ) : branchCount > 1 && branches.length > 0 ? (
      <div className="sm:col-span-2">
        <p className="text-sm font-medium text-slate-700">Stock at each branch</p>
        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-3 rounded-sm border border-slate-200 px-3 py-2">
              <span className="flex-1 truncate text-sm text-slate-700">{b.name}{b.isDefault ? " (main)" : ""}</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.branchStock[b.id] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, branchStock: { ...f.branchStock, [b.id]: e.target.value } }))}
                className="w-20 rounded-sm border border-slate-300 bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
            </label>
          ))}
        </div>
      </div>
    ) : (
      <Input label="Stock" type="number" min="0" placeholder="How many you have" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} />
    )
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <BackLink href="/vendor/products" label="Products" />
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Add product</h1>

      <Tabs tabs={productTabs} active={activeTab} onChange={tabs.onChange} />

      <form onSubmit={handleCreate} onInvalidCapture={tabs.onInvalid} className="space-y-4">
        {stores.length > 1 && (
          <div className="max-w-xs">
            <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
          </div>
        )}

        <TabPanel id="details" active={activeTab}>
        <FormSection title="Product">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Name"
                placeholder="e.g. Ankara maxi dress"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                }}
                required
              />
            </div>
            {form.saleMode === "fixed_price" ? (
              <PriceInput label="Price" leadingText="₦" placeholder="0" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} usdRate={usdRate} required />
            ) : (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                Price agreed with each customer - they request a quote. <button type="button" onClick={() => setForm((f) => ({ ...f, saleMode: "fixed_price" }))} className="font-medium text-brand-700 hover:underline cursor-pointer">Use a fixed price</button>
              </div>
            )}
            {stockField}
            {hasField("category") && (
              <CategoryPicker
                storeId={storeId}
                apiFetch={apiFetch}
                categories={categories}
                value={form.categoryId}
                onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                onCreated={(category) => setCategories((c) => [...c, category])}
              />
            )}
            {hasField("condition") && form.productType === "physical" && (
              <Select label="Condition" options={CONDITION_OPTIONS} value={form.condition} onChange={(v) => setForm((f) => ({ ...f, condition: v }))} />
            )}
          </div>
        </FormSection>
        </TabPanel>

        <TabPanel id="photos" active={activeTab}>
        {(hasField("photos") || hasField("video")) && (
          <FormSection title="Photos & video">
            <ProductMediaField
              images={form.images}
              pendingUploads={pendingUploads}
              dragIndex={dragIndex}
              onDragStart={setDragIndex}
              onDrop={handleDrop}
              onDragEnd={() => setDragIndex(null)}
              onImageUpload={handleImageUpload}
              onRemoveImage={removeImage}
              showPhotos={hasField("photos")}
              showVideo={hasField("video")}
              videoUrl={form.videoUrl}
              uploadingVideo={uploadingVideo}
              videoUploadStatus={videoUploadStatus}
              videoUploadProgress={videoUploadProgress}
              onVideoUpload={handleVideoUpload}
              onRemoveVideo={removeVideo}
            />
            {hasField("photos") && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <Switch
                  checked={!!form.imageDisclaimer}
                  onChange={(value) => setForm((f) => ({ ...f, imageDisclaimer: value }))}
                  label="Photos are for illustration only"
                  description={`Shows "${IMAGE_DISCLAIMER_TEXT}" on the photos - for a sample or supplier photo.`}
                />
              </div>
            )}
          </FormSection>
        )}
        </TabPanel>

        <TabPanel id="description" active={activeTab}>
        {(hasField("description") || hasField("sizeGuide")) && (
          <FormSection title="Description">
            <div className="space-y-4">
              {hasField("description") && <Textarea label="About this product" placeholder="Material, size, what's included..." rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
              {hasField("sizeGuide") && <SizeGuideField storeId={storeId} apiFetch={apiFetch} value={{ sizeGuide: form.sizeGuide, sizeGuidePresetId: form.sizeGuidePresetId || null }} onChange={(v) => setForm((f) => ({ ...f, sizeGuide: v.sizeGuide, sizeGuidePresetId: v.sizeGuidePresetId }))} />}
            </div>
          </FormSection>
        )}
        </TabPanel>

        <TabPanel id="more" active={activeTab}>
        <FormSection
          title="More options"
          description="Extras most products don't need."
          actions={<ProductFormFieldsButton compact fields={PRODUCT_FORM_FIELDS} visibleFields={visibleFormFields} onToggle={toggleFormField} saving={savingFormPreferences} />}
        >
          <div className="space-y-5">
            <Select label="How it sells" options={SALE_MODE_OPTIONS} value={form.saleMode} onChange={(v) => setForm((f) => ({ ...f, saleMode: v, price: v === "invoice_required" ? "" : f.price, discountPercent: v === "invoice_required" ? "" : f.discountPercent, priceTiers: v === "invoice_required" ? null : f.priceTiers }))} />

            {hasField("variants") && <NewProductVariantsEditor value={form.variants} invoiceRequired={form.saleMode === "invoice_required"} onChange={(variants) => setForm((f) => ({ ...f, variants }))} usdRate={usdRate} />}

            {(hasField("discount") || hasField("costPrice")) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasField("discount") && form.saleMode === "fixed_price" && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-sm font-medium text-slate-700">Discount %</label>
                      <InfoTip>The customer pays less and sees the old price crossed out. Leave blank for no discount.</InfoTip>
                    </div>
                    <Input type="number" min="1" max="99" placeholder="0" value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} />
                  </div>
                )}
                {hasField("costPrice") && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-sm font-medium text-slate-700">Cost price</label>
                      <InfoTip>What you paid for it. Only you see this - it&apos;s used to work out your profit.</InfoTip>
                    </div>
                    <PriceInput leadingText="₦" placeholder="0" value={form.costPrice} onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))} />
                    {form.costPrice !== "" && form.price !== "" && Number(form.price) > 0 && (
                      <p className="text-xs text-slate-600 mt-1">
                        Profit {formatCurrency(Number(form.price) - Number(form.costPrice))} ({Math.round(((Number(form.price) - Number(form.costPrice)) / Number(form.price)) * 100)}%)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasField("priceTiers") && form.saleMode === "fixed_price" && <WholesaleTierEditor value={form.priceTiers} onChange={(v) => setForm((f) => ({ ...f, priceTiers: v }))} usdRate={usdRate} />}

            {hasField("customerFields") && <CustomerFieldsEditor value={form.customerFields} onChange={(customerFields) => setForm((f) => ({ ...f, customerFields }))} />}

            {(hasField("sku") || hasField("slug") || hasField("expiryDate")) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasField("sku") && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Input label="SKU / barcode" placeholder="e.g. RTB-001" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></div>
                    <BarcodeScanButton onScan={(code) => setForm((f) => ({ ...f, sku: code }))} />
                  </div>
                )}
                {hasField("expiryDate") && form.productType === "physical" && (
                  <Input type="date" label="Expiry / use-by date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
                )}
                {hasField("slug") && (
                  <Input
                    label="Web link"
                    hint={form.slug ? `.../products/${form.slug}` : "Made from the name"}
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm((f) => ({ ...f, slug: e.target.value }));
                    }}
                  />
                )}
              </div>
            )}

            {optionalFieldsShown === 0 && <p className="text-xs text-slate-600">All extra fields are hidden. Use &ldquo;Show / hide fields&rdquo; to bring some back.</p>}
          </div>
        </FormSection>
        </TabPanel>

        <div hidden={activeTab === "stock"} className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface/95 backdrop-blur sm:sticky sm:inset-x-auto sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:px-0">
            <Button type="submit" size="lg" loading={submitting || uploadingVideo} disabled={pendingUploads.length > 0 || uploadingVideo} fullWidth>
              {pendingUploads.length > 0 ? "Uploading photos..." : "Create product"}
            </Button>
          </div>
        </div>
      </form>

      <StorageLimitDialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} />
    </div>
  );
}
