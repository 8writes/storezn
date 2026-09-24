"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { Switch } from "@/components/ui/Switch.js";
import { formatCurrency } from "@/lib/format.js";
import { isPlusStore } from "@/lib/storePlan.js";
import { computeWholesalePrice } from "@/lib/pricing.js";
import { ProductPicker } from "@/components/pos/ProductPicker.js";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";

// Manually recording a sale that already happened - in person, by phone,
// by transfer. Recorded as paid, stock deducted right away. The live
// in-person register is a separate screen (/vendor/pos).
export default function RecordPastSalePage() {
  const router = useRouter();
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const [cart, setCart] = useState([]);
  const [details, setDetails] = useState({});
  const [buyer, setBuyer] = useState({ buyerName: "Walk In Customer", buyerPhone: "", buyerEmail: "", note: "", delivered: true });
  const [pay, setPay] = useState({ method: "cash", provider: "Moniepoint" }); // method: cash | card | transfer
  const [submitting, setSubmitting] = useState(false);

  const isOwner = user?.role === "vendor";
  const branchScoped = user?.role === "staff" && !!user?.branchId;

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores[0]) setStoreId(data.stores[0].id);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!storeId || branchScoped || user?.role !== "vendor") return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/branches`)
      .then((data) => {
        setBranches(data.branches);
        setBranchId(data.branches[0]?.id || "");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, branchScoped, user?.role]);

  const activeStore = stores.find((s) => s.id === storeId);

  const addToCart = (product, variant) => {
    const key = `${product.id}:${variant?.id || ""}`;
    setDetails((d) => ({ ...d, [key]: { product, variant } }));
    setCart((rows) => {
      const found = rows.find((r) => r.key === key);
      if (found) return rows.map((r) => (r.key === key ? { ...r, quantity: r.quantity + 1 } : r));
      return [...rows, { key, productId: product.id, variantId: variant?.id || null, quantity: 1 }];
    });
  };
  const setQty = (key, q) =>
    setCart((rows) => (q <= 0 ? rows.filter((r) => r.key !== key) : rows.map((r) => (r.key === key ? { ...r, quantity: q } : r))));

  const lines = useMemo(
    () =>
      cart.map((r) => {
        const det = details[r.key] || {};
        const lineTotal = det.variant?.price != null
          ? det.variant.price * r.quantity
          : det.product
            ? computeWholesalePrice(det.product, r.quantity).total
            : 0;
        const unit = r.quantity > 0 ? lineTotal / r.quantity : lineTotal;
        return { ...r, product: det.product, variant: det.variant, unit, lineTotal };
      }),
    [cart, details],
  );
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const countByProduct = useMemo(() => {
    const m = new Map();
    for (const l of lines) m.set(l.productId, (m.get(l.productId) || 0) + l.quantity);
    return m;
  }, [lines]);

  const submit = async (e) => {
    e.preventDefault();
    if (lines.length === 0) return toast.error("Add at least one item");
    setSubmitting(true);
    try {
      const payload = {
        buyerName: buyer.buyerName,
        delivered: buyer.delivered,
        items: cart.map((r) => ({ productId: r.productId, ...(r.variantId ? { variantId: r.variantId } : {}), quantity: r.quantity })),
      };
      if (buyer.buyerEmail) payload.buyerEmail = buyer.buyerEmail;
      if (buyer.buyerPhone) payload.buyerPhone = buyer.buyerPhone;
      if (buyer.note) payload.note = buyer.note;
      if (branchId) payload.branchId = branchId;
      payload.paymentMethod = pay.method;
      if (pay.method === "card" || pay.method === "transfer") payload.paymentProvider = pay.provider;
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/offline`, { method: "POST", body: JSON.stringify(payload) });
      toast.success("Sale recorded");
      router.push(`/vendor/orders/${data.order.id}?storeId=${storeId}`);
    } catch (err) {
      toast.error(err.message || "Failed to record");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  if (activeStore && !isPlusStore(activeStore)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">Recording past sales is a Storezn+ feature</h1>
          <p className="text-sm text-slate-800 max-w-sm mx-auto">
            Log sales made in person, by phone, or in cash so they show up in your order history and stock.
            Upgrade to Storezn+ to record these sales without opening a POS register.
          </p>
          <Link href="/vendor/plus" className="inline-block">
            <Button type="button">See Storezn+</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackLink href="/vendor/orders" label="Back to orders" />

      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Record a past sale
            <InfoTip>For a sale that already happened - in person, by phone, or by transfer. Recorded as paid, stock deducted right away.</InfoTip>
          </span>
        }
        description="Record a completed sale, assign the branch, capture payment method, and deduct stock immediately."
        actions={
          <>
          {stores.length > 1 && (
            <div className="w-40">
              <Select
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
                value={storeId}
                onChange={(value) => {
                  setStoreId(value);
                  setCart([]);
                  setDetails({});
                }}
              />
            </div>
          )}
          {branches.length > 1 && (
            <div className="w-40">
              <Select options={branches.map((b) => ({ value: b.id, label: b.name }))} value={branchId} onChange={setBranchId} required />
            </div>
          )}
          </>
        }
      />

      {isOwner && (
        <div className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 flex items-center justify-between gap-2">
          <span>Selling to a customer right now? Use the register instead - split payments, a cash drawer, Z reports, works offline.</span>
          <Link href="/vendor/pos" className="font-semibold text-brand-700 hover:text-brand-800 whitespace-nowrap">
            Open the register →
          </Link>
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <ProductPicker storeId={storeId} token={token} onAdd={addToCart} cartCountByProduct={countByProduct} />

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
            <p className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <ShoppingCart size={16} className="text-slate-400" /> Current sale
            </p>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-800 px-4 py-6 text-center">Tap a product to add it</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900 truncate">{l.product?.name || "Item"}</p>
                      {l.variant && (
                        <p className="text-[11px] text-slate-800 truncate">
                          {Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-800">{formatCurrency(l.unit)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 border border-slate-300 rounded-sm shrink-0">
                      <button type="button" onClick={() => setQty(l.key, l.quantity - 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                        <Minus size={11} />
                      </button>
                      <span className="w-4 text-center text-xs">{l.quantity}</span>
                      <button type="button" onClick={() => setQty(l.key, l.quantity + 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                        <Plus size={11} />
                      </button>
                    </div>
                    <button type="button" onClick={() => setQty(l.key, 0)} className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 font-semibold text-slate-900">
              <span className="text-sm">Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Customer</p>
            <Input label="Name" value={buyer.buyerName} onChange={(e) => setBuyer((b) => ({ ...b, buyerName: e.target.value }))} required />
            <Input label="Phone (optional)" value={buyer.buyerPhone} onChange={(e) => setBuyer((b) => ({ ...b, buyerPhone: e.target.value }))} />
            <Input label="Email (optional)" type="email" value={buyer.buyerEmail} onChange={(e) => setBuyer((b) => ({ ...b, buyerEmail: e.target.value }))} />
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Paid by</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "cash", l: "Cash" },
                { v: "card", l: "POS" },
                { v: "transfer", l: "Transfer" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPay((p) => ({ ...p, method: o.v }))}
                  className={`py-2 rounded-sm border text-sm font-medium cursor-pointer ${
                    pay.method === o.v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {(pay.method === "card" || pay.method === "transfer") && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="w-full text-xs text-slate-800">
                  {pay.method === "transfer" ? "Transferred to which account?" : "Which POS machine?"}
                </span>
                {["Moniepoint", "Opay", "Other"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPay((s) => ({ ...s, provider: p }))}
                    className={`px-3 py-1.5 rounded-sm border text-sm font-medium cursor-pointer ${
                      pay.provider === p ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {pay.provider === "Other" && (
                  <input
                    type="text"
                    placeholder="Provider"
                    onChange={(e) => setPay((s) => ({ ...s, provider: e.target.value }))}
                    className="px-3 py-1.5 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                  />
                )}
              </div>
            )}
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-4">
            <Textarea label="Note (optional)" rows={2} value={buyer.note} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} />
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-4">
            <Switch
              checked={buyer.delivered}
              onChange={(delivered) => setBuyer((b) => ({ ...b, delivered }))}
              label="Already delivered"
              description={buyer.delivered ? "Recorded straight to delivered." : "Recorded as processing."}
            />
          </div>

          <Button type="submit" loading={submitting} disabled={lines.length === 0} fullWidth size="lg">
            Record sale{lines.length > 0 ? ` · ${formatCurrency(total)}` : ""}
          </Button>
        </div>
      </form>
    </div>
  );
}
