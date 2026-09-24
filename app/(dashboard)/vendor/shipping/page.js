"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Button } from "@/components/ui/Button.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";

const EMPTY_FORM = { defaultShippingFee: "0", defaultShippingIsTBD: true };
const EMPTY_RATE_FORM = { state: "", city: "", fee: "" };

export default function VendorShippingPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) =>
        setForm({
          defaultShippingFee: String(data.store.defaultShippingFee ?? 0),
          defaultShippingIsTBD: data.store.defaultShippingIsTBD ?? true,
        }),
      )
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Shipping settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save shipping settings");
    } finally {
      setSaving(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Shipping"
        description="Set default delivery pricing and add fixed rates for locations where you already know the cost."
      />

      {loading || !form ? (
        <FormSkeleton fields={3} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <form onSubmit={handleSave} className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Default delivery fee</label>
              <p className="text-xs text-slate-800 mt-0.5">
                Used on any order that needs shipping, unless a more specific rate below matches the delivery state/city.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, defaultShippingIsTBD: true }))}
                className={`text-left rounded-sm border p-3 cursor-pointer transition-colors ${
                  form.defaultShippingIsTBD ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">To be determined</p>
                <p className="text-xs text-slate-800 mt-0.5">Recommended</p>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, defaultShippingIsTBD: false }))}
                className={`text-left rounded-sm border p-3 cursor-pointer transition-colors ${
                  !form.defaultShippingIsTBD ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Fixed amount</p>
                <p className="text-xs text-slate-800 mt-0.5">Same fee every time</p>
              </button>
            </div>

            {form.defaultShippingIsTBD ? (
              <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-sm p-3">
                Buyers won&apos;t be charged shipping at checkout for orders that fall under this default - they&apos;ll be told
                you confirm delivery pricing after they order. You&apos;ll record the real delivery fee on each order once you
                know it (for your own records).
              </p>
            ) : (
              <PriceInput
                label="Fee"
                className="max-w-xs"
                value={form.defaultShippingFee}
                onChange={(v) => setForm((f) => ({ ...f, defaultShippingFee: v }))}
              />
            )}

            <Button type="submit" loading={saving} fullWidth>Save</Button>
          </form>

          <ShippingRatesManager storeId={storeId} apiFetch={apiFetch} token={token} />
        </div>
      )}
    </div>
  );
}

// A city/LGA-specific rate beats a state-wide one, which beats the store's
// flat default fee above - see lib/shipping.js's resolveShippingFee.
function ShippingRatesManager({ storeId, apiFetch, token }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_RATE_FORM);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates`)
      .then((data) => setRates(data.shippingRates))
      .catch((err) => toast.error(err.message || "Failed to load shipping rates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Also gated on token, not just storeId - same client-navigation race
    // as the parent page's own effect (see there for the full
    // explanation).
    if (!token || !storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const payload = { state: form.state, fee: Number(form.fee) };
      if (form.city) payload.city = form.city;
      await apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates`, { method: "POST", body: JSON.stringify(payload) });
      setForm(EMPTY_RATE_FORM);
      toast.success("Shipping rate added");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to add shipping rate");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (rateId) => {
    setDeletingId(rateId);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates/${rateId}`, { method: "DELETE" });
      setRates((r) => r.filter((x) => x.id !== rateId));
    } catch (err) {
      toast.error(err.message || "Failed to remove shipping rate");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700">Shipping rates by state/city</p>
        <p className="text-xs text-slate-800">
          Add a fixed rate for areas you already know the cost for. Everywhere else uses your default above. Leave city
          blank for a rate that covers the whole state.
        </p>
      </div>

      {!loading && rates.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="text-slate-900">{r.city ? `${r.city}, ${r.state}` : `${r.state} (whole state)`}</p>
                <p className="text-xs text-slate-800">{formatCurrency(r.fee)}</p>
              </div>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="text-slate-700 hover:text-red-600 disabled:opacity-50 cursor-pointer">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <Select
          label="State"
          options={NIGERIA_STATE_OPTIONS}
          value={form.state}
          onChange={(v) => setForm((f) => ({ ...f, state: v, city: "" }))}
          required
        />
        <Select
          label="City/LGA (optional)"
          options={getLgaOptions(form.state)}
          value={form.city}
          onChange={(v) => setForm((f) => ({ ...f, city: v }))}
          disabled={!form.state}
          placeholder="Whole state"
        />
        <PriceInput label="Fee" value={form.fee} onChange={(v) => setForm((f) => ({ ...f, fee: v }))} required />
        <Button type="submit" size="sm" variant="outline" loading={adding} fullWidth>
          Add rate
        </Button>
      </form>
    </div>
  );
}
