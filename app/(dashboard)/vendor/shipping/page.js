"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Button } from "@/components/ui/Button.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";

const EMPTY_FORM = { defaultShippingFee: "0" };
const EMPTY_RATE_FORM = { state: "", city: "", fee: "" };

export default function VendorShippingPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => setForm({ defaultShippingFee: String(data.store.defaultShippingFee ?? 0) }))
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Shipping</h1>

      {stores.length > 1 && (
        <div className="max-w-xs">
          <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}

      {loading || !form ? (
        <FormSkeleton fields={3} />
      ) : (
        <>
          <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Default shipping fee</label>
              <p className="text-xs text-slate-500 mt-0.5">
                Charged on any order that needs shipping, unless a more specific rate below matches the delivery state/city.
              </p>
            </div>
            <PriceInput
              label="Fee"
              className="max-w-xs"
              value={form.defaultShippingFee}
              onChange={(v) => setForm({ defaultShippingFee: v })}
            />
            <Button type="submit" loading={saving}>Save</Button>
          </form>

          <ShippingRatesManager storeId={storeId} apiFetch={apiFetch} />
        </>
      )}
    </div>
  );
}

// A city/LGA-specific rate beats a state-wide one, which beats the store's
// flat default fee above - see lib/shipping.js's resolveShippingFee.
function ShippingRatesManager({ storeId, apiFetch }) {
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
    if (!storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
    <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700">Shipping rates by state/city</p>
        <p className="text-xs text-slate-500">Leave city blank for a rate that covers the whole state.</p>
      </div>

      {!loading && rates.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="text-slate-900">{r.city ? `${r.city}, ${r.state}` : `${r.state} (whole state)`}</p>
                <p className="text-xs text-slate-500">{formatCurrency(r.fee)}</p>
              </div>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="text-slate-400 hover:text-red-600 disabled:opacity-50 cursor-pointer">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
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
        <Button type="submit" size="sm" variant="outline" loading={adding} className="col-span-2 sm:col-span-1 w-fit">
          Add rate
        </Button>
      </form>
    </div>
  );
}
