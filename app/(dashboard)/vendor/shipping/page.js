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
import { Input } from "@/components/ui/Input.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";
import { COUNTRY_OPTIONS, FOREIGN_COUNTRY_OPTIONS, NIGERIA } from "@/lib/countries.js";

const EMPTY_RATE_FORM = { country: NIGERIA, state: "", city: "", fee: "" };

export default function VendorShippingPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  // The loaded form is tagged with the store it came from, so switching
  // stores shows the skeleton again instead of briefly showing the previous
  // store's numbers - and `loading` is derived from that rather than being
  // set synchronously inside the effect below.
  const [loaded, setLoaded] = useState(null);
  const form = loaded?.storeId === storeId ? loaded.form : null;
  const loading = !form;
  const [saving, setSaving] = useState(false);

  const setForm = (next) =>
    setLoaded((current) => ({
      storeId,
      form: typeof next === "function" ? next(current?.form) : next,
    }));

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return undefined;
    let alive = true;
    apiFetch(`/api/v1/vendor/stores/${storeId}`)
      .then((data) => {
        if (!alive) return;
        setLoaded({
          storeId,
          form: {
            defaultShippingFee: String(data.store.defaultShippingFee ?? 0),
            defaultShippingIsTBD: data.store.defaultShippingIsTBD ?? true,
            deliveryStates: Array.isArray(data.store.deliveryStates) && data.store.deliveryStates.length > 0
              ? data.store.deliveryStates
              : null,
            internationalDeliveryEnabled: !!data.store.internationalDeliveryEnabled,
            deliveryCountries: Array.isArray(data.store.deliveryCountries) && data.store.deliveryCountries.length > 0
              ? data.store.deliveryCountries
              : null,
            intlDefaultShippingFee: String(data.store.intlDefaultShippingFee ?? 0),
            intlDefaultShippingIsTBD: data.store.intlDefaultShippingIsTBD ?? true,
          },
        });
      })
      .catch((err) => {
        if (alive) toast.error(err.message || "Failed to load store");
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, token, storeId]);

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
              <label className="text-sm font-medium text-slate-700">Default delivery fee in Nigeria</label>
              <p className="text-xs text-slate-800 mt-0.5">
                Used on any Nigerian order that needs shipping, unless one of your rates matches the delivery state/city.
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
                leadingText="₦"
                className="max-w-xs"
                value={form.defaultShippingFee}
                onChange={(v) => setForm((f) => ({ ...f, defaultShippingFee: v }))}
              />
            )}

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Where you deliver</label>
                <p className="text-xs text-slate-800 mt-0.5">
                  A buyer whose delivery state isn&apos;t covered is told you don&apos;t deliver there, and can&apos;t check out.
                  Digital products are unaffected.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, deliveryStates: null }))}
                  className={`rounded-sm border p-3 text-left cursor-pointer transition-colors ${
                    form.deliveryStates === null ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-900">Anywhere in Nigeria</span>
                  <span className="mt-0.5 block text-xs text-slate-800">Every state. This is the default.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, deliveryStates: f.deliveryStates ?? [] }))}
                  className={`rounded-sm border p-3 text-left cursor-pointer transition-colors ${
                    form.deliveryStates !== null ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-900">Only selected states</span>
                  <span className="mt-0.5 block text-xs text-slate-800">Pick the states you serve.</span>
                </button>
              </div>

              {form.deliveryStates !== null && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-800">
                      {form.deliveryStates.length} of {NIGERIA_STATE_OPTIONS.length} selected
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setForm((f) => ({ ...f, deliveryStates: NIGERIA_STATE_OPTIONS.map((o) => o.value) }))} className="cursor-pointer text-brand-700 underline hover:text-brand-800">
                        Select all
                      </button>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, deliveryStates: [] }))} className="cursor-pointer text-slate-700 underline hover:text-slate-900">
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-sm border border-slate-200 p-2 grid grid-cols-2 gap-1">
                    {NIGERIA_STATE_OPTIONS.map((option) => {
                      const on = form.deliveryStates.includes(option.value);
                      return (
                        <label key={option.value} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setForm((f) => ({
                              ...f,
                              deliveryStates: on
                                ? f.deliveryStates.filter((v) => v !== option.value)
                                : [...f.deliveryStates, option.value],
                            }))}
                            className="size-4 shrink-0 accent-brand-600"
                          />
                          <span className="truncate">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {form.deliveryStates.length === 0 && (
                    <p className="rounded-sm border border-amber-200 bg-amber-100 p-2.5 text-xs text-amber-900">
                      No state selected - saving this leaves you delivering anywhere, since &ldquo;nowhere&rdquo; would close your store to every physical order.
                    </p>
                  )}
                </>
              )}
            </div>

            <AbroadDeliverySection form={form} setForm={setForm} />

            <Button type="submit" loading={saving} fullWidth>Save</Button>
          </form>

          <ShippingRatesManager storeId={storeId} apiFetch={apiFetch} token={token} />
        </div>
      )}
    </div>
  );
}

// A city/LGA-specific rate beats a state-wide one, which beats a
// country-wide one, which beats the store's default fee (local or abroad) -
// see lib/shipping.js's resolveShippingFee.
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
      const payload = { country: form.country, fee: Number(form.fee) };
      if (form.state.trim()) payload.state = form.state.trim();
      if (form.city.trim()) payload.city = form.city.trim();
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
        <p className="text-sm font-semibold text-slate-700">Shipping rates by location</p>
        <p className="text-xs text-slate-800">
          Add a fixed rate for places you already know the cost for. The most specific one wins: a city beats its
          state, and a state beats its whole country. Everywhere else uses your default fee.
        </p>
      </div>

      {!loading && rates.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="text-slate-900">{rateLabel(r)}</p>
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
        <div className="sm:col-span-2">
          <Select
            label="Country"
            options={COUNTRY_OPTIONS}
            value={form.country}
            onChange={(v) => setForm((f) => ({ ...f, country: v || NIGERIA, state: "", city: "" }))}
            required
          />
        </div>
        {form.country === NIGERIA ? (
          <>
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
          </>
        ) : (
          <>
            {/* Abroad there's no fixed list - leave both blank for a rate
                that covers the whole country. */}
            <Input
              label="State / region (optional)"
              placeholder={`Whole of ${form.country}`}
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value, city: e.target.value.trim() ? f.city : "" }))}
              maxLength={100}
            />
            <Input
              label="City (optional)"
              placeholder={form.state.trim() ? "Whole state / region" : "Add a state / region first"}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              disabled={!form.state.trim()}
              maxLength={100}
            />
          </>
        )}
        <PriceInput label="Fee" leadingText="₦" value={form.fee} onChange={(v) => setForm((f) => ({ ...f, fee: v }))} required />
        <Button type="submit" size="sm" variant="outline" loading={adding} fullWidth>
          Add rate
        </Button>
      </form>
    </div>
  );
}

function rateLabel(rate) {
  const country = rate.country || NIGERIA;
  const abroad = country !== NIGERIA;
  const suffix = abroad ? `, ${country}` : "";
  if (rate.city) return `${rate.city}, ${rate.state}${suffix}`;
  if (rate.state) return `${rate.state}${suffix} (whole ${abroad ? "region" : "state"})`;
  return `${country} (whole country)`;
}

// Delivery outside Nigeria - its own switch, separate from "Accept
// international payments". Nothing here changes Nigerian delivery above.
function AbroadDeliverySection({ form, setForm }) {
  const [search, setSearch] = useState("");
  const selected = form.deliveryCountries;
  const query = search.trim().toLowerCase();
  const visible = query ? FOREIGN_COUNTRY_OPTIONS.filter((o) => o.label.toLowerCase().includes(query)) : FOREIGN_COUNTRY_OPTIONS;

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Deliver outside Nigeria</label>
          <p className="text-xs text-slate-800 mt-0.5">
            Let customers abroad enter an address in their own country. Separate from accepting international payments.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.internationalDeliveryEnabled}
          aria-label="Deliver outside Nigeria"
          onClick={() => setForm((f) => ({ ...f, internationalDeliveryEnabled: !f.internationalDeliveryEnabled }))}
          className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${
            form.internationalDeliveryEnabled ? "bg-brand-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
              form.internationalDeliveryEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {form.internationalDeliveryEnabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, deliveryCountries: null }))}
              className={`rounded-sm border p-3 text-left cursor-pointer transition-colors ${
                selected === null ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-medium text-slate-900">Anywhere in the world</span>
              <span className="mt-0.5 block text-xs text-slate-800">Every country.</span>
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, deliveryCountries: f.deliveryCountries ?? [] }))}
              className={`rounded-sm border p-3 text-left cursor-pointer transition-colors ${
                selected !== null ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-medium text-slate-900">Only selected countries</span>
              <span className="mt-0.5 block text-xs text-slate-800">Pick the countries you ship to.</span>
            </button>
          </div>

          {selected !== null && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-800">{selected.length} selected</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, deliveryCountries: [] }))} className="cursor-pointer text-xs text-slate-700 underline hover:text-slate-900">
                  Clear
                </button>
              </div>
              <Input placeholder="Search countries" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-64 overflow-y-auto rounded-sm border border-slate-200 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {visible.map((option) => {
                  const on = selected.includes(option.value);
                  return (
                    <label key={option.value} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setForm((f) => ({
                          ...f,
                          deliveryCountries: on
                            ? f.deliveryCountries.filter((v) => v !== option.value)
                            : [...f.deliveryCountries, option.value],
                        }))}
                        className="size-4 shrink-0 accent-brand-600"
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                  );
                })}
                {visible.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-700">No country matches.</p>}
              </div>
              {selected.length === 0 && (
                <p className="rounded-sm border border-amber-200 bg-amber-100 p-2.5 text-xs text-amber-900">
                  No country selected - saving this leaves you delivering anywhere in the world.
                </p>
              )}
            </>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Default delivery fee abroad</p>
            <p className="text-xs text-slate-800">For an address abroad that none of your rates match.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, intlDefaultShippingIsTBD: true }))}
                className={`text-left rounded-sm border p-3 cursor-pointer transition-colors ${
                  form.intlDefaultShippingIsTBD ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">To be determined</p>
                <p className="text-xs text-slate-800 mt-0.5">You confirm it after they order</p>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, intlDefaultShippingIsTBD: false }))}
                className={`text-left rounded-sm border p-3 cursor-pointer transition-colors ${
                  !form.intlDefaultShippingIsTBD ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Fixed amount</p>
                <p className="text-xs text-slate-800 mt-0.5">Same fee for every country</p>
              </button>
            </div>
            {!form.intlDefaultShippingIsTBD && (
              <PriceInput
                label="Fee abroad"
                leadingText="₦"
                className="max-w-xs"
                value={form.intlDefaultShippingFee}
                onChange={(v) => setForm((f) => ({ ...f, intlDefaultShippingFee: v }))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
