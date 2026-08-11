"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
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
import { dnsInstructionsFor } from "@/lib/domain.js";
import { CUSTOM_DOMAINS_ENABLED } from "@/lib/featureFlags.js";

const EMPTY_SOCIAL_LINKS = { website: "", instagram: "", twitter: "", facebook: "", tiktok: "", whatsapp: "" };
const EMPTY_FORM = { logoUrl: "", faviconUrl: "", customDomain: "", socialLinks: EMPTY_SOCIAL_LINKS, feeChargedToCustomer: false };
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

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
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
  const [checkingDomain, setCheckingDomain] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores.length > 0) setStoreId(data.stores[0].id);
        else setLoading(false);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"));
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
          customDomain: data.store.customDomain || "",
          socialLinks: { ...EMPTY_SOCIAL_LINKS, ...(data.store.socialLinks || {}) },
          feeChargedToCustomer: !!data.store.feeChargedToCustomer,
        });
        setCommissionRate(data.effectiveCommissionRatePercent);
        setStores((prev) => prev.map((s) => (s.id === storeId ? data.store : s)));
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
      setStores((prev) => prev.map((s) => (s.id === storeId ? data.store : s)));
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
      setStores((prev) => prev.map((s) => (s.id === storeId ? data.store : s)));
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
      setStores((prev) => prev.map((s) => (s.id === storeId ? data.store : s)));
      setPayoutForm(EMPTY_PAYOUT_FORM);
      toast.success(`Verified, payouts go to ${data.store.accountName}`);
    } catch (err) {
      toast.error(err.message || "Could not verify that account");
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleCheckDomainStatus = async () => {
    setCheckingDomain(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/domain-status`);
      setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, domainStatus: data.domainStatus } : s)));
      toast[data.domainStatus === "verified" ? "success" : "message"](
        data.domainStatus === "verified" ? "Domain verified and live" : "Still waiting on DNS - this can take a few minutes to a few hours to propagate",
      );
    } catch (err) {
      toast.error(err.message || "Could not check domain status");
    } finally {
      setCheckingDomain(false);
    }
  };

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  const store = stores.find((s) => s.id === storeId);
  const bankOptions = banks.map((b) => ({ value: b.code, label: b.name }));

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Store settings</h1>

      {stores.length > 1 && (
        <div className="max-w-xs">
          <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}

      {loading || !form ? (
        <FormSkeleton fields={4} />
      ) : (
        <>
          {store && (
            <div className="space-y-1.5 max-w-md">
              <label className="text-sm font-medium text-slate-700">Your storefront</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <CopyableUrl url={getStorefrontUrl(store)} />
                </div>
                <StoreQrCodeButton storeName={store.name} storeUrl={getStorefrontUrl(store)} />
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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    label="Custom domain (optional)"
                    placeholder="yourdomain.com"
                    value={form.customDomain}
                    onChange={(e) => setForm((f) => ({ ...f, customDomain: e.target.value }))}
                    disabled={!CUSTOM_DOMAINS_ENABLED}
                  />
                </div>
                {CUSTOM_DOMAINS_ENABLED && store?.customDomain && (
                  <Badge color={store.domainStatus === "verified" ? "green" : "amber"}>
                    {store.domainStatus === "verified" ? "Verified" : "Pending DNS"}
                  </Badge>
                )}
              </div>

              {!CUSTOM_DOMAINS_ENABLED && (
                <p className="text-xs text-slate-400">Coming soon - not available to set up yet.</p>
              )}

              {CUSTOM_DOMAINS_ENABLED && store?.customDomain && store.domainStatus !== "verified" && (
                <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 space-y-2 text-xs text-slate-600">
                  <p>Add this DNS record at your domain registrar, then check status - it can take a few minutes to a few hours to propagate:</p>
                  {(() => {
                    const rec = dnsInstructionsFor(store.customDomain);
                    return (
                      <div className="flex flex-wrap gap-4 font-mono text-slate-800">
                        <span>Type: {rec.type}</span>
                        <span>Name: {rec.name}</span>
                        <span>Value: {rec.value}</span>
                      </div>
                    );
                  })()}
                  {store.domainVerification?.length > 0 && (
                    <div className="pt-1 border-t border-slate-200 space-y-1">
                      <p>Vercel also needs this TXT record to confirm you own the domain:</p>
                      {store.domainVerification.map((v) => (
                        <div key={v.value} className="flex flex-wrap gap-4 font-mono text-slate-800">
                          <span>Type: {v.type}</span>
                          <span>Name: {v.domain}</span>
                          <span>Value: {v.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button type="button" size="sm" variant="secondary" loading={checkingDomain} onClick={handleCheckDomainStatus}>
                    Check status
                  </Button>
                </div>
              )}
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
