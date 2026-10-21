"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import { Switch } from "@/components/ui/Switch.js";
import { FormSection } from "@/components/ui/FormSection.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";
import { COUNTRY_OPTIONS, FOREIGN_COUNTRY_OPTIONS, NIGERIA } from "@/lib/countries.js";

// Shipping settings, top to bottom in the order a vendor thinks about them:
// what delivery costs, where they deliver, whether they deliver abroad, and
// (optional) fixed fees for particular places. The first three save with
// the Save button; place fees save as they're added.

const EMPTY_RATE_FORM = { country: NIGERIA, state: "", city: "", fee: "" };

export default function VendorShippingPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  // The loaded form is tagged with the store it came from, so switching
  // stores shows the skeleton again instead of the previous store's numbers.
  const [loaded, setLoaded] = useState(null);
  const form = loaded?.storeId === storeId ? loaded.form : null;
  const [saving, setSaving] = useState(false);

  const setForm = (next) =>
    setLoaded((current) => ({
      storeId,
      form: typeof next === "function" ? next(current?.form) : next,
    }));

  useEffect(() => {
    // Gated on token too - storeId can be ready before this page's token.
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
            deliveryStates: Array.isArray(data.store.deliveryStates) && data.store.deliveryStates.length > 0 ? data.store.deliveryStates : null,
            internationalDeliveryEnabled: !!data.store.internationalDeliveryEnabled,
            deliveryCountries: Array.isArray(data.store.deliveryCountries) && data.store.deliveryCountries.length > 0 ? data.store.deliveryCountries : null,
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
      toast.success("Shipping saved");
    } catch (err) {
      toast.error(err.message || "Failed to save shipping settings");
    } finally {
      setSaving(false);
    }
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Shipping</h1>
        <p className="mt-1 text-sm text-slate-700">What delivery costs and where you deliver.</p>
      </div>

      {!form ? (
        <FormSkeleton fields={3} />
      ) : (
        <>
          <form onSubmit={handleSave} className="space-y-4">
            <FormSection title="Delivery fee">
              <FeeChoice
                tbd={form.defaultShippingIsTBD}
                fee={form.defaultShippingFee}
                onTbdChange={(tbd) => setForm((f) => ({ ...f, defaultShippingIsTBD: tbd }))}
                onFeeChange={(fee) => setForm((f) => ({ ...f, defaultShippingFee: fee }))}
                tbdHint="Customers pay for delivery later. You agree the cost after they order."
                fixedHint="Every order pays this, unless you set a fee for their area below."
              />
            </FormSection>

            <FormSection title="Where you deliver in Nigeria">
              <div className="space-y-3">
                <Choice
                  options={[
                    { value: "all", label: "Anywhere in Nigeria" },
                    { value: "some", label: "Only some states" },
                  ]}
                  value={form.deliveryStates === null ? "all" : "some"}
                  onChange={(v) => setForm((f) => ({ ...f, deliveryStates: v === "all" ? null : f.deliveryStates ?? [] }))}
                />
                {form.deliveryStates !== null && (
                  <CheckList
                    options={NIGERIA_STATE_OPTIONS}
                    selected={form.deliveryStates}
                    onChange={(deliveryStates) => setForm((f) => ({ ...f, deliveryStates }))}
                    searchPlaceholder="Search states"
                    emptyWarning="Pick at least one state - with none picked you deliver anywhere."
                    allowSelectAll
                  />
                )}
              </div>
            </FormSection>

            <FormSection title="Outside Nigeria">
              <div className="space-y-4">
                <Switch
                  checked={form.internationalDeliveryEnabled}
                  onChange={(value) => setForm((f) => ({ ...f, internationalDeliveryEnabled: value }))}
                  label="Deliver to other countries"
                  description="Customers abroad can enter an address in their country."
                />
                {form.internationalDeliveryEnabled && (
                  <>
                    <Choice
                      options={[
                        { value: "all", label: "Any country" },
                        { value: "some", label: "Only some countries" },
                      ]}
                      value={form.deliveryCountries === null ? "all" : "some"}
                      onChange={(v) => setForm((f) => ({ ...f, deliveryCountries: v === "all" ? null : f.deliveryCountries ?? [] }))}
                    />
                    {form.deliveryCountries !== null && (
                      <CheckList
                        options={FOREIGN_COUNTRY_OPTIONS}
                        selected={form.deliveryCountries}
                        onChange={(deliveryCountries) => setForm((f) => ({ ...f, deliveryCountries }))}
                        searchPlaceholder="Search countries"
                        emptyWarning="Pick at least one country - with none picked you deliver anywhere."
                      />
                    )}
                    <div className="space-y-2 border-t border-slate-200 pt-4">
                      <p className="text-sm font-medium text-slate-700">Delivery fee abroad</p>
                      <FeeChoice
                        tbd={form.intlDefaultShippingIsTBD}
                        fee={form.intlDefaultShippingFee}
                        onTbdChange={(tbd) => setForm((f) => ({ ...f, intlDefaultShippingIsTBD: tbd }))}
                        onFeeChange={(fee) => setForm((f) => ({ ...f, intlDefaultShippingFee: fee }))}
                        tbdHint="You agree the cost after they order."
                        fixedHint="Every order abroad pays this, unless you set a fee for their country below."
                      />
                    </div>
                  </>
                )}
              </div>
            </FormSection>

            <Button type="submit" loading={saving} fullWidth>Save</Button>
          </form>

          <PlaceFees storeId={storeId} apiFetch={apiFetch} token={token} abroad={form.internationalDeliveryEnabled} />
        </>
      )}
    </div>
  );
}

// Two side-by-side options, one selected.
function Choice({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-sm border px-3 py-2.5 text-sm font-medium text-left cursor-pointer transition-colors ${
            value === option.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// "Agree after order" or a fixed ₦ amount.
function FeeChoice({ tbd, fee, onTbdChange, onFeeChange, tbdHint, fixedHint }) {
  return (
    <div className="space-y-3">
      <Choice
        options={[
          { value: "tbd", label: "Agree after order" },
          { value: "fixed", label: "Fixed fee" },
        ]}
        value={tbd ? "tbd" : "fixed"}
        onChange={(v) => onTbdChange(v === "tbd")}
      />
      {tbd ? (
        <p className="text-xs text-slate-600">{tbdHint}</p>
      ) : (
        <div className="space-y-1">
          <PriceInput label="Fee" leadingText="₦" className="max-w-xs" value={fee} onChange={onFeeChange} />
          <p className="text-xs text-slate-600">{fixedHint}</p>
        </div>
      )}
    </div>
  );
}

// Searchable tick list (states or countries).
function CheckList({ options, selected, onChange, searchPlaceholder, emptyWarning, allowSelectAll = false }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1"><Input placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <span className="shrink-0 text-xs text-slate-600 tabular-nums">{selected.length} picked</span>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-sm border border-slate-200 p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-0.5">
        {visible.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} className="size-4 shrink-0 accent-brand-600" />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="px-2 py-1.5 text-sm text-slate-600">No match.</p>}
      </div>
      <div className="flex gap-3 text-xs">
        {allowSelectAll && (
          <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="font-medium text-brand-700 hover:underline cursor-pointer">Pick all</button>
        )}
        {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="font-medium text-slate-700 hover:underline cursor-pointer">Clear</button>}
      </div>
      {selected.length === 0 && <p className="text-xs text-amber-800">{emptyWarning}</p>}
    </div>
  );
}

function placeLabel(rate) {
  const country = rate.country || NIGERIA;
  const abroad = country !== NIGERIA;
  const suffix = abroad ? `, ${country}` : "";
  if (rate.city) return `${rate.city}, ${rate.state}${suffix}`;
  if (rate.state) return `${rate.state}${suffix}`;
  return country;
}

// Fixed fees for particular places - the most specific match wins (a city
// beats its state, a state beats its whole country), and everywhere else
// pays the fee above. See lib/shipping.js's resolveShippingFee.
function PlaceFees({ storeId, apiFetch, token, abroad }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_RATE_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates`)
      .then((data) => setRates(data.shippingRates))
      .catch((err) => toast.error(err.message || "Failed to load fees"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !storeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const nigeria = form.country === NIGERIA;

  const add = async () => {
    if (nigeria && !form.state) return toast.error("Pick a state");
    if (!(Number(form.fee) >= 0) || form.fee === "") return toast.error("Enter the fee");
    setSaving(true);
    try {
      const payload = { country: form.country, fee: Number(form.fee) };
      if (form.state.trim()) payload.state = form.state.trim();
      if (form.city.trim()) payload.city = form.city.trim();
      await apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates`, { method: "POST", body: JSON.stringify(payload) });
      setForm(EMPTY_RATE_FORM);
      setAdding(false);
      toast.success("Fee added");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to add the fee");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rateId) => {
    setDeletingId(rateId);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/shipping-rates/${rateId}`, { method: "DELETE" });
      setRates((r) => r.filter((x) => x.id !== rateId));
    } catch (err) {
      toast.error(err.message || "Failed to remove the fee");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <FormSection
      title="Fees for specific places"
      description="Optional. A different fee for a state, city or country. Saved as you add them."
    >
      <div className="space-y-3">
        {!loading && rates.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-sm border border-slate-200">
            {rates.map((rate) => (
              <li key={rate.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-900">{placeLabel(rate)}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(rate.fee)}</span>
                  <button type="button" onClick={() => remove(rate.id)} disabled={deletingId === rate.id} aria-label={`Remove fee for ${placeLabel(rate)}`} className="p-1 text-slate-500 hover:text-red-600 disabled:opacity-50 cursor-pointer">
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="rounded-sm border border-slate-200 p-3 space-y-3">
            {abroad && (
              <Select label="Country" options={COUNTRY_OPTIONS} value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v || NIGERIA, state: "", city: "" }))} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nigeria ? (
                <>
                  <Select label="State" options={NIGERIA_STATE_OPTIONS} value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v, city: "" }))} />
                  <Select label="City/LGA (optional)" options={getLgaOptions(form.state)} value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={!form.state} placeholder="Whole state" />
                </>
              ) : (
                <>
                  <Input label="State / region (optional)" placeholder={`All of ${form.country}`} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value, city: e.target.value.trim() ? f.city : "" }))} maxLength={100} />
                  <Input label="City (optional)" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} disabled={!form.state.trim()} maxLength={100} />
                </>
              )}
              <PriceInput label="Fee" leadingText="₦" value={form.fee} onChange={(v) => setForm((f) => ({ ...f, fee: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => { setAdding(false); setForm(EMPTY_RATE_FORM); }} disabled={saving}>Cancel</Button>
              <Button type="button" onClick={add} loading={saving}>Add fee</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add a fee for a place
          </Button>
        )}
      </div>
    </FormSection>
  );
}
