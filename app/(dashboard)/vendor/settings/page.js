"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { ImageCropModal } from "@/components/ui/ImageCropModal.js";
import { uploadFile } from "@/lib/clientUpload.js";
import { AlertTriangle } from "lucide-react";

const EMPTY_SOCIAL_LINKS = { website: "", instagram: "", twitter: "", facebook: "", tiktok: "", whatsapp: "" };
const EMPTY_FORM = { logoUrl: "", faviconUrl: "", socialLinks: EMPTY_SOCIAL_LINKS, feeChargedToCustomer: false };

// Two separate uploads with different shapes: the navbar logo is a wide
// rectangle (vendors' real logos are rarely square), the favicon is a
// small round crop for the browser tab icon - forcing one shape onto
// both would either stretch the logo or crop the favicon into something
// that doesn't read at 16px.
const CROP_CONFIG = {
  logoUrl: { field: "logoUrl", purpose: "store-logo", title: "Crop logo", aspect: 3, cropShape: "rect", outputWidth: 600, outputHeight: 200 },
  faviconUrl: { field: "faviconUrl", purpose: "store-favicon", title: "Crop favicon", aspect: 1, cropShape: "round", outputWidth: 256, outputHeight: 256 },
};

export default function VendorSettingsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading, updateStore } = useVendorStore();
  const [form, setForm] = useState(null);
  const [store, setStore] = useState(null);
  const [commissionRate, setCommissionRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setForm({
          logoUrl: data.store.logoUrl || "",
          faviconUrl: data.store.faviconUrl || "",
          socialLinks: { ...EMPTY_SOCIAL_LINKS, ...(data.store.socialLinks || {}) },
          feeChargedToCustomer: !!data.store.feeChargedToCustomer,
        });
        setCommissionRate(data.effectiveCommissionRatePercent);
        setStore(data.store);
        updateStore(data.store);
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const handleFileSelect = (target) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropTarget(target);
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setCropTarget(null);
  };

  // Saves straight to the store on upload, rather than waiting for the
  // "Save settings" button below - an uploaded image visibly appearing
  // in its preview otherwise looks saved even though it's still only in
  // local form state, and a refresh (or navigating off without noticing
  // the separate button) would silently lose it.
  const handleCropped = async (blob) => {
    const src = cropSrc;
    const { field, purpose } = CROP_CONFIG[cropTarget];
    setCropSrc(null);
    setCropTarget(null);
    setUploading(true);
    try {
      const file = new File([blob], `${purpose}.png`, { type: "image/png" });
      const url = await uploadFile(token, file, purpose);
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, { method: "PATCH", body: JSON.stringify({ [field]: url }) });
      setForm((f) => ({ ...f, [field]: url }));
      updateStore(data.store);
      toast.success(field === "logoUrl" ? "Logo updated" : "Favicon updated");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (src) URL.revokeObjectURL(src);
    }
  };

  const handleToggleOpen = async () => {
    setTogglingOpen(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ isOpen: !store.isOpen }),
      });
      setStore(data.store);
      updateStore(data.store);
      toast.success(data.store.isOpen ? "Your store is now live" : "Your store is now offline");
    } catch (err) {
      toast.error(err.message || "Failed to update store status");
    } finally {
      setTogglingOpen(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(form) });
      updateStore(data.store);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Store settings</h1>

      {!loading && store && !store.isActive && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>Your store has been disabled by Storezn and isn&apos;t visible to customers. Contact support for details.</p>
        </div>
      )}

      {!loading && store && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Store status</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {store.isOpen
                ? "Your store is live - customers can browse and order."
                : "Your store is offline - customers see a closed page instead of your storefront."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={store.isOpen}
            disabled={togglingOpen || !store.isActive}
            onClick={handleToggleOpen}
            className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              store.isOpen ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                store.isOpen ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {loading || !form ? (
        <FormSkeleton fields={4} />
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-sm p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Store logo</label>
            <div className="flex items-center gap-4">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="h-12 w-36 rounded-sm object-contain bg-slate-50 border border-slate-200" />
              ) : (
                <div className="h-12 w-36 rounded-sm bg-slate-100 flex items-center justify-center text-slate-300 text-xs">None</div>
              )}
              <label className="text-sm text-brand-600 hover:underline cursor-pointer">
                {uploading ? "Uploading…" : "Upload logo"}
                <input type="file" accept="image/*" onChange={handleFileSelect("logoUrl")} disabled={uploading} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-slate-500">Shown as a wide rectangle in your storefront navbar - you&apos;ll be able to crop it after choosing a file.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Favicon</label>
            <div className="flex items-center gap-4">
              {form.faviconUrl ? (
                <img src={form.faviconUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 text-xs">None</div>
              )}
              <label className="text-sm text-brand-600 hover:underline cursor-pointer">
                {uploading ? "Uploading…" : "Upload favicon"}
                <input type="file" accept="image/*" onChange={handleFileSelect("faviconUrl")} disabled={uploading} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-slate-500">Shown as your browser tab icon - separate from the logo above, since it needs to be a small circle.</p>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-sm font-medium text-slate-700">Socials (optional)</label>
              <p className="text-xs text-slate-500 mt-0.5">
                Only the ones you fill in show up as icons in your storefront&apos;s footer. WhatsApp also powers the quick-help button shoppers see on every page.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Website"
                placeholder="https://yourbrand.com"
                value={form.socialLinks.website}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, website: e.target.value } }))}
              />
              <Input
                label="Instagram"
                placeholder="https://instagram.com/yourbrand"
                value={form.socialLinks.instagram}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, instagram: e.target.value } }))}
              />
              <Input
                label="Twitter / X"
                placeholder="https://x.com/yourbrand"
                value={form.socialLinks.twitter}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, twitter: e.target.value } }))}
              />
              <Input
                label="Facebook"
                placeholder="https://facebook.com/yourbrand"
                value={form.socialLinks.facebook}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, facebook: e.target.value } }))}
              />
              <Input
                label="TikTok"
                placeholder="https://tiktok.com/@yourbrand"
                value={form.socialLinks.tiktok}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, tiktok: e.target.value } }))}
              />
              <Input
                label="WhatsApp number"
                placeholder="2348012345678"
                value={form.socialLinks.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, whatsapp: e.target.value.replace(/[^\d+]/g, "") } }))}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Who pays the commission?</label>
              {commissionRate != null && <Badge color="slate">{commissionRate}% rate</Badge>}
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              When you sell a product, who pays the commission fee to the platform?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, feeChargedToCustomer: false }))}
                className={`flex-1 px-4 py-2 rounded-sm border text-sm font-medium transition-colors cursor-pointer ${
                  !form.feeChargedToCustomer
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                I absorb it
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, feeChargedToCustomer: true }))}
                className={`flex-1 px-4 py-2 rounded-sm border text-sm font-medium transition-colors cursor-pointer ${
                  form.feeChargedToCustomer
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Customer pays it
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {form.feeChargedToCustomer
                ? "Shown as a separate \"Platform fee\" line at checkout, added on top of the order total. You receive your full subtotal + shipping."
                : "Commission is deducted from your payout. Customers never see it, they just pay the order total."}
            </p>
          </div>

          <Button type="submit" loading={saving}>Save settings</Button>
        </form>
      )}

      <ImageCropModal
        open={!!cropSrc}
        imageSrc={cropSrc}
        onCancel={handleCropCancel}
        onCropped={handleCropped}
        {...(cropTarget ? CROP_CONFIG[cropTarget] : {})}
      />
    </div>
  );
}
