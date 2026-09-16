"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { PushNotificationToggle } from "@/components/ui/PushNotificationToggle.js";
import { CustomDomainSettings } from "@/components/ui/CustomDomainSettings.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { ImageCropModal } from "@/components/ui/ImageCropModal.js";
import { StorageLimitDialog } from "@/components/ui/StorageLimitDialog.js";
import { Select } from "@/components/ui/Select.js";
import { uploadFile } from "@/lib/clientUpload.js";
import { formatCurrency, formatBytes } from "@/lib/format.js";
import { NIGERIA_STATE_OPTIONS } from "@/lib/nigeria.js";
import { isColorTooLight } from "@/lib/colorShades.js";
import { AlertTriangle, Palette } from "lucide-react";

const EMPTY_SOCIAL_LINKS = { website: "", instagram: "", twitter: "", facebook: "", tiktok: "", whatsapp: "" };
const EMPTY_FORM = { logoUrl: "", faviconUrl: "", socialLinks: EMPTY_SOCIAL_LINKS, feeChargedToCustomer: false, returnWindowDays: "7", address: "", state: "", showShipsFrom: true, description: "", showDescription: true, storefrontAccentColor: "" };

const DESCRIPTION_MAX = 160;
const DEFAULT_ACCENT = "#14915b";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Two separate uploads with different shapes: the navbar logo is a wide
// rectangle (vendors' real logos are rarely square), the favicon is a
// small round crop for the browser tab icon - forcing one shape onto
// both would either stretch the logo or crop the favicon into something
// that doesn't read at 16px.
const CROP_CONFIG = {
  logoUrl: { field: "logoUrl", purpose: "store-logo", title: "Crop logo", aspect: 3, cropShape: "rect", outputWidth: 600, outputHeight: 200 },
  faviconUrl: { field: "faviconUrl", purpose: "store-favicon", title: "Crop favicon", aspect: 1, cropShape: "round", outputWidth: 256, outputHeight: 256 },
};

// Small uppercase eyebrow above each card - the actual visual break
// between sections, so scanning the page means jumping section to
// section instead of reading every label in sequence to figure out
// where one topic ends and the next begins.
function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">{children}</p>;
}

export default function VendorSettingsPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  // Staff can reach this page but every setting here is the owner's to
  // change - all they get is the push-notification toggle for their own
  // device.
  const isOwner = user?.role === "vendor";

  const { stores, storeId, loading: storesLoading, updateStore } = useVendorStore();
  const [form, setForm] = useState(null);
  const [store, setStore] = useState(null);
  const [commissionRate, setCommissionRate] = useState(null);
  const [flatFee, setFlatFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [togglingMarketplace, setTogglingMarketplace] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageLimitBytes, setStorageLimitBytes] = useState(0);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId || !isOwner) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setForm({
          logoUrl: data.store.logoUrl || "",
          faviconUrl: data.store.faviconUrl || "",
          socialLinks: { ...EMPTY_SOCIAL_LINKS, ...(data.store.socialLinks || {}) },
          feeChargedToCustomer: !!data.store.feeChargedToCustomer,
          returnWindowDays: String(data.store.returnWindowDays ?? 7),
          address: data.store.address || "",
          state: data.store.state || "",
          showShipsFrom: data.store.showShipsFrom !== false,
          description: data.store.description || "",
          showDescription: data.store.showDescription !== false,
          storefrontAccentColor: data.store.storefrontAccentColor || "",
        });
        setCommissionRate(data.effectiveCommissionRatePercent);
        setFlatFee(data.effectiveFlatFee || 0);
        setIsPlus(!!data.isPlus);
        setStorageUsedBytes(data.storageUsedBytes || 0);
        setStorageLimitBytes(data.storageLimitBytes || 0);
        setStore(data.store);
        updateStore(data.store);
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, isOwner]);

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
      // Storage usage changed (new file added, old one best-effort removed
      // server-side) - refetch rather than estimate locally, since the
      // old file's exact size isn't known client-side.
      apiFetch(`/api/v1/vendor/stores/${storeId}`)
        .then((d) => {
          setStorageUsedBytes(d.storageUsedBytes || 0);
          setStorageLimitBytes(d.storageLimitBytes || 0);
        })
        .catch(() => {});
    } catch (err) {
      if (err.status === 402) setStorageDialogOpen(true);
      else toast.error(err.message || "Upload failed");
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

  const handleToggleMarketplace = async () => {
    setTogglingMarketplace(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ listOnMarketplace: !store.listOnMarketplace }),
      });
      setStore(data.store);
      updateStore(data.store);
      toast.success(data.store.listOnMarketplace ? "Your products now show up in the marketplace" : "Removed from the marketplace");
    } catch (err) {
      toast.error(err.message || "Failed to update marketplace listing");
    } finally {
      setTogglingMarketplace(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.storefrontAccentColor && !HEX_RE.test(form.storefrontAccentColor)) {
      toast.error("Enter a valid hex color, e.g. #7c3aed");
      return;
    }
    if (form.storefrontAccentColor && isColorTooLight(form.storefrontAccentColor)) {
      toast.error("That color's too close to white - your header/footer text would be unreadable. Pick something darker.");
      return;
    }
    setSaving(true);
    try {
      // A free store's form still carries storefrontAccentColor (as ""),
      // but the API rejects that field outright for non-Plus stores -
      // sending it would fail the whole save, so drop it unless it's
      // actually theirs to set.
      const payload = { ...form };
      if (!isPlus) delete payload.storefrontAccentColor;
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(payload) });
      updateStore(data.store);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">Store settings</h1>

      <PushNotificationToggle token={token} />

      {isOwner && !loading && store && !store.isActive && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>Your store has been disabled by Storezn and isn&apos;t visible to customers. Contact support for details.</p>
        </div>
      )}

      {isOwner && !loading && store && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-surface border border-slate-200 rounded-sm p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Store status</p>
            <p className="text-xs text-slate-800 mt-0.5">
              {store.isOpen ? "Live - customers can browse and order." : "Offline - customers see a closed page instead."}
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
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                store.isOpen ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="bg-surface border border-slate-200 rounded-sm p-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-900">Marketplace listing</p>
              <InfoTip>
                Shoppers can discover your products from the Storezn marketplace, outside your own website link. Turning this off only removes you from the marketplace - your store link keeps working exactly as before.
              </InfoTip>
            </div>
            <p className="text-xs text-slate-800 mt-0.5">
              {store.listOnMarketplace ? "Your products show up in the marketplace." : "Not listed in the marketplace."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={store.listOnMarketplace}
            disabled={togglingMarketplace || !store.isActive}
            onClick={handleToggleMarketplace}
            className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              store.listOnMarketplace ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                store.listOnMarketplace ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Custom domain full-width on mobile; Storage rides beside it on desktop. */}
        <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <CustomDomainSettings
            store={store}
            isPlus={isPlus}
            apiFetch={apiFetch}
            storeId={storeId}
            onUpdated={(updated) => {
              setStore(updated);
              updateStore(updated);
            }}
          />
          {storageLimitBytes > 0 && (
            <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel>Storage</SectionLabel>
                <Link href="/vendor/plus" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Get more storage
                </Link>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-800">Used across logos, favicons, and product photos</span>
                  <span className={storageUsedBytes >= storageLimitBytes ? "font-medium text-red-600" : "text-slate-700 font-medium"}>
                    {formatBytes(storageUsedBytes)} of {formatBytes(storageLimitBytes)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${storageUsedBytes / storageLimitBytes >= 0.9 ? "bg-red-500" : "bg-brand-600"}`}
                    style={{ width: `${Math.min(100, (storageUsedBytes / storageLimitBytes) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {loading || !form ? (
        <FormSkeleton fields={4} />
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {isPlus ? (
            <div className="lg:col-span-2 bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-slate-400" />
                <SectionLabel>Storefront theme</SectionLabel>
              </div>
              <p className="text-xs text-slate-800">Sets the accent color for your storefront&apos;s header, buttons, and prices.</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={HEX_RE.test(form.storefrontAccentColor) ? form.storefrontAccentColor : DEFAULT_ACCENT}
                  onChange={(e) => setForm((f) => ({ ...f, storefrontAccentColor: e.target.value }))}
                  className="h-10 w-14 rounded-sm border border-slate-200 cursor-pointer shrink-0"
                />
                <Input
                  placeholder={DEFAULT_ACCENT}
                  value={form.storefrontAccentColor}
                  onChange={(e) => setForm((f) => ({ ...f, storefrontAccentColor: e.target.value }))}
                  className="flex-1"
                />
                {form.storefrontAccentColor && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, storefrontAccentColor: "" }))}
                    className="text-xs text-slate-800 hover:text-slate-700 shrink-0 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
              {form.storefrontAccentColor && !HEX_RE.test(form.storefrontAccentColor) && (
                <p className="text-xs text-red-600">Enter a valid hex color, e.g. #7c3aed</p>
              )}
              {form.storefrontAccentColor && HEX_RE.test(form.storefrontAccentColor) && isColorTooLight(form.storefrontAccentColor) && (
                <p className="text-xs text-red-600">Too close to white - your header/footer text (white) would be unreadable on it. Pick something darker.</p>
              )}
            </div>
          ) : (
            <div className="lg:col-span-2 bg-surface border border-dashed border-slate-300 rounded-sm p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Palette size={16} className="text-slate-400" />
                  <SectionLabel>Storefront theme</SectionLabel>
                </div>
                <Badge color="slate">Storezn+</Badge>
              </div>
              <p className="text-sm text-slate-800">
                Pick a custom accent color for your storefront&apos;s header, buttons, and prices.
              </p>
              <Link href="/vendor/plus" className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
                Upgrade to Storezn+
              </Link>
            </div>
          )}

          <div className="lg:col-span-2 bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <SectionLabel>Branding</SectionLabel>

            <div className="space-y-1.5">
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
                <InfoTip>Shown as a wide rectangle in your storefront navbar - you&apos;ll crop it after choosing a file.</InfoTip>
              </div>
            </div>

            <div className="space-y-1.5">
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
                <InfoTip>Your browser tab icon - separate from the logo above, since it needs to be a small circle.</InfoTip>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-slate-700">Store description</label>
                <InfoTip>Used as your storefront&apos;s preview text when a link to it is shared (e.g. on WhatsApp or Twitter/X), and, if the toggle below is on, as the tagline under your store name on your storefront.</InfoTip>
              </div>
              <Textarea
                rows={3}
                maxLength={DESCRIPTION_MAX}
                placeholder="A short line about what you sell and what makes your store worth a visit."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <p className="text-xs text-slate-400 text-right">{form.description.length}/{DESCRIPTION_MAX}</p>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show description on storefront</p>
                  <p className="text-xs text-slate-800 mt-0.5">
                    {form.showDescription
                      ? "Shown as the tagline under your store name."
                      : "Hidden - your storefront shows “All products” instead."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.showDescription}
                  onClick={() => setForm((f) => ({ ...f, showDescription: !f.showDescription }))}
                  className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${
                    form.showDescription ? "bg-brand-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                      form.showDescription ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <SectionLabel>Contact &amp; socials</SectionLabel>

            <div className="flex items-center gap-1.5">
              <label className="text-sm font-medium text-slate-700">Store address</label>
              <InfoTip>Shown in your storefront&apos;s footer, for a pickup location or just to build trust.</InfoTip>
            </div>
            <Input placeholder="12 Allen Avenue, Ikeja, Lagos" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />

            <div className="flex items-center gap-1.5 pt-2">
              <label className="text-sm font-medium text-slate-700">Store location</label>
              <InfoTip>Where you ship from - shown as the location on your products&apos; cards and detail pages, both on your storefront and the marketplace.</InfoTip>
            </div>
            <Select options={NIGERIA_STATE_OPTIONS} value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="Select a state" />

            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <p className="text-sm font-medium text-slate-700">Show &quot;Ships from&quot; on products</p>
                <p className="text-xs text-slate-800 mt-0.5">
                  {form.showShipsFrom
                    ? "Your store location shows on product cards and detail pages."
                    : "Your store location is hidden from shoppers."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.showShipsFrom}
                onClick={() => setForm((f) => ({ ...f, showShipsFrom: !f.showShipsFrom }))}
                className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${
                  form.showShipsFrom ? "bg-brand-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                    form.showShipsFrom ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-1.5 pt-2">
              <label className="text-sm font-medium text-slate-700">Socials</label>
              <InfoTip>Only the ones you fill in show up as icons in your footer. WhatsApp also powers the quick-help button shoppers see everywhere.</InfoTip>
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

          <div className="lg:col-span-2 bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <SectionLabel>Fees &amp; refunds</SectionLabel>

            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Who pays the platform fee?</label>
                {commissionRate != null && (
                  <Badge color="slate">
                    {commissionRate}%{flatFee > 0 ? ` + ${formatCurrency(flatFee)}` : ""}
                  </Badge>
                )}
                <InfoTip>
                  {form.feeChargedToCustomer
                    ? "Shown as a separate \"Platform fee\" at checkout, added on top of the total. You receive your full subtotal + shipping."
                    : "Commission is deducted from your payout. Customers never see it, they just pay the order total."}
                </InfoTip>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, feeChargedToCustomer: false }))}
                  className={`flex-1 px-4 py-2 rounded-sm border text-sm font-medium transition-colors cursor-pointer ${
                    !form.feeChargedToCustomer
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
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
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Customer pays it
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-slate-700">Refund window (days)</label>
                <InfoTip>How many days after you mark an order delivered a customer can still request a refund.</InfoTip>
              </div>
              <Input
                type="number"
                min="0"
                max="365"
                className="max-w-32 mt-1.5"
                value={form.returnWindowDays}
                onChange={(e) => setForm((f) => ({ ...f, returnWindowDays: e.target.value }))}
              />
            </div>
          </div>
          </div>

          <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-surface/95 backdrop-blur-sm border-t border-slate-200">
            <Button type="submit" loading={saving} fullWidth>Save settings</Button>
          </div>
        </form>
      )}

      <ImageCropModal
        open={!!cropSrc}
        imageSrc={cropSrc}
        onCancel={handleCropCancel}
        onCropped={handleCropped}
        {...(cropTarget ? CROP_CONFIG[cropTarget] : {})}
      />

      <StorageLimitDialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} />
    </div>
  );
}
