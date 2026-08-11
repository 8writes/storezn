"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { CopyableUrl } from "@/components/ui/CopyableUrl.js";
import { StoreQrCodeButton } from "@/components/ui/StoreQrCodeButton.js";
import { ImageCropModal } from "@/components/ui/ImageCropModal.js";
import { uploadFile } from "@/lib/clientUpload.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

const EMPTY_SOCIAL_LINKS = { website: "", instagram: "", twitter: "", facebook: "", tiktok: "", whatsapp: "" };
const EMPTY_FORM = { logoUrl: "", faviconUrl: "", socialLinks: EMPTY_SOCIAL_LINKS, feeChargedToCustomer: false };
const EMPTY_PAYOUT_FORM = { bankCode: "", accountNumber: "" };

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
  const [verification, setVerification] = useState(null);
  const [form, setForm] = useState(null);
  const [commissionRate, setCommissionRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [payoutForm, setPayoutForm] = useState(EMPTY_PAYOUT_FORM);
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/verification")
      .then(setVerification)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    setBanksLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        setForm({
          logoUrl: data.store.logoUrl || "",
          faviconUrl: data.store.faviconUrl || "",
          socialLinks: { ...EMPTY_SOCIAL_LINKS, ...(data.store.socialLinks || {}) },
          feeChargedToCustomer: !!data.store.feeChargedToCustomer,
        });
        setCommissionRate(data.effectiveCommissionRatePercent);
        updateStore(data.store);
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
    apiFetch(`/api/v1/vendor/stores/${storeId}/payout-account`)
      .then((data) => setBanks(data.banks || []))
      .catch((err) => toast.error(err.message || "Failed to load bank list"))
      .finally(() => setBanksLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    setLinkingAccount(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/payout-account`, { method: "POST", body: JSON.stringify(payoutForm) });
      updateStore(data.store);
      setPayoutForm(EMPTY_PAYOUT_FORM);
      toast.success(`Verified, payouts go to ${data.store.accountName}`);
    } catch (err) {
      toast.error(err.message || "Could not verify that account");
    } finally {
      setLinkingAccount(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  const store = stores.find((s) => s.id === storeId);
  const bankOptions = banks.map((b) => ({ value: b.code, label: b.name }));

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Store settings</h1>

      {loading || !form ? (
        <FormSkeleton fields={4} />
      ) : (
        <>
          {store && verification?.approvalStatus === "approved" && (
            <div className="space-y-1.5 max-w-md bg-brand-50 border border-brand-100 rounded-sm p-4">
              <label className="text-sm font-semibold text-slate-900">This is your store&apos;s link</label>
              <p className="text-xs text-slate-500">Anyone who opens it can browse and buy from you - copy it and share it on WhatsApp, Instagram, anywhere.</p>
              <div className="flex items-start gap-2 pt-1">
                <div className="flex-1 min-w-0">
                  <CopyableUrl url={getStorefrontUrl(store)} shareTitle={store.name} />
                </div>
                <StoreQrCodeButton storeName={store.name} storeUrl={getStorefrontUrl(store)} />
              </div>
            </div>
          )}

          {store && verification && verification.approvalStatus !== "approved" && (
            <div className="max-w-md flex items-start gap-3 bg-slate-50 border border-dashed border-slate-200 rounded-sm p-4">
              <ShieldAlert size={18} className="text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-500">Your store&apos;s link will appear here</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Once your identity is verified, you&apos;ll get a shareable link customers can use to shop from you.{" "}
                  <Link href="/vendor/verification" className="underline font-medium text-slate-500">Verify now</Link>.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Payout account</label>
              <Badge color={store?.subAccountCode ? "green" : "amber"}>
                {store?.subAccountCode ? "Verified" : "Not linked"}
              </Badge>
            </div>

            {store?.subAccountCode ? (
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-sm p-4 text-sm text-green-800">
                <div>
                  <p className="font-medium">{store.accountName}</p>
                  <p>{store.bankName} · {store.accountNumber}</p>
                  <p className="text-xs text-green-700 mt-1">Your share of each sale is paid out to this account automatically. To change it, link a new account below.</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Enter your bank account below - we verify it and set up automatic payouts through Paystack. Customers can&apos;t check out from your store until this is done.
              </p>
            )}

            <form onSubmit={handleLinkAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <Select
                label="Bank"
                options={bankOptions}
                loading={banksLoading}
                searchable
                value={payoutForm.bankCode}
                onChange={(v) => setPayoutForm((f) => ({ ...f, bankCode: v }))}
                required
              />
              <Input
                label="Account number"
                placeholder="0123456789"
                maxLength={10}
                value={payoutForm.accountNumber}
                onChange={(e) => setPayoutForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "") }))}
                required
              />
              <Button type="submit" loading={linkingAccount} className="sm:col-span-2 w-fit">
                {store?.subAccountCode ? "Link a different account" : "Verify & link account"}
              </Button>
            </form>
          </div>

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
        </>
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
