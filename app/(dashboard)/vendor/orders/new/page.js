"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { Switch } from "@/components/ui/Switch.js";
import { formatCurrency } from "@/lib/format.js";
import { isPlusStore } from "@/lib/storePlan.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";

const EMPTY_ITEM = { productId: "", variantId: "", quantity: "1" };
const EMPTY_BUYER = { buyerName: "Walk In Customer", buyerEmail: "", buyerPhone: "", note: "", delivered: true };

export default function RecordOfflineOrderPage() {
  const router = useRouter();
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState([]);
  const [variantsByProduct, setVariantsByProduct] = useState({});
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  // A branch-scoped staff member's own branch is used automatically by
  // the server regardless of what's sent (see the offline order route) -
  // they never see this selector at all.
  const branchScoped = user?.role === "staff" && !!user?.branchId;

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
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?pageSize=100`)
      .then((data) => setProducts(data.products))
      .catch((err) => toast.error(err.message || "Failed to load products"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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

  const loadVariants = (productId) => {
    if (!productId || variantsByProduct[productId]) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`)
      .then((data) => setVariantsByProduct((v) => ({ ...v, [productId]: data.variants })))
      .catch(() => setVariantsByProduct((v) => ({ ...v, [productId]: [] })));
  };

  const updateItem = (index, patch) => {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleProductChange = (index, productId) => {
    updateItem(index, { productId, variantId: "" });
    loadVariants(productId);
  };

  const addItem = () => setItems((rows) => [...rows, { ...EMPTY_ITEM }]);
  const removeItem = (index) => setItems((rows) => rows.filter((_, i) => i !== index));

  const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} (${formatCurrency(getEffectivePrice(p.price, p.discountPercent))})` }));

  const total = items.reduce((sum, row) => {
    const product = products.find((p) => p.id === row.productId);
    if (!product) return sum;
    const variant = (variantsByProduct[row.productId] || []).find((v) => v.id === row.variantId);
    const unitPrice = variant?.price ?? getEffectivePrice(product.price, product.discountPercent);
    return sum + unitPrice * (Number(row.quantity) || 0);
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = items.filter((row) => row.productId && Number(row.quantity) > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        buyerName: buyer.buyerName,
        delivered: buyer.delivered,
        items: validItems.map((row) => ({
          productId: row.productId,
          ...(row.variantId ? { variantId: row.variantId } : {}),
          quantity: Number(row.quantity),
        })),
      };
      if (buyer.buyerEmail) payload.buyerEmail = buyer.buyerEmail;
      if (buyer.buyerPhone) payload.buyerPhone = buyer.buyerPhone;
      if (buyer.note) payload.note = buyer.note;
      if (branchId) payload.branchId = branchId;

      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/offline`, { method: "POST", body: JSON.stringify(payload) });
      toast.success("Order recorded");
      router.push(`/vendor/orders/${data.order.id}?storeId=${storeId}`);
    } catch (err) {
      toast.error(err.message || "Failed to record order");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  const activeStore = stores.find((s) => s.id === storeId);
  if (activeStore && !isPlusStore(activeStore)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-white border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">Offline orders are a Storezn+ feature</h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Upgrade to record sales made in person, by phone, or in cash, so they show up in your order history and stock alongside real checkouts.
          </p>
          <Link href="/vendor/plus" className="inline-block">
            <Button type="button">Upgrade to Storezn+</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackLink href="/vendor/orders" label="Back to orders" />

      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
          Record an offline order
          <InfoTip>
            For a sale that happened in person, by phone, or in cash - not through your storefront checkout. It&apos;s recorded as paid immediately and stock is deducted right away.
          </InfoTip>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {(stores.length > 1 || branches.length > 1) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            {stores.length > 1 && (
              <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
            )}
            {branches.length > 1 && (
              <Select label="Branch" options={branches.map((b) => ({ value: b.id, label: b.name }))} value={branchId} onChange={setBranchId} required />
            )}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Customer</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={buyer.buyerName} onChange={(e) => setBuyer((b) => ({ ...b, buyerName: e.target.value }))} required />
            <Input label="Phone (optional)" value={buyer.buyerPhone} onChange={(e) => setBuyer((b) => ({ ...b, buyerPhone: e.target.value }))} />
            <Input
              label="Email (optional)"
              type="email"
              className="sm:col-span-2"
              value={buyer.buyerEmail}
              onChange={(e) => setBuyer((b) => ({ ...b, buyerEmail: e.target.value }))}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Items</p>
          <div className="space-y-3">
            {items.map((row, index) => {
              const variantOptions = (variantsByProduct[row.productId] || []).map((v) => ({
                value: v.id,
                label: Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", "),
              }));
              return (
                <div key={index} className="grid grid-cols-2 sm:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 items-end">
                  <Select label="Product" options={productOptions} loading={loading} value={row.productId} onChange={(v) => handleProductChange(index, v)} />
                  {variantOptions.length > 0 && (
                    <Select label="Option" options={variantOptions} value={row.variantId} onChange={(v) => updateItem(index, { variantId: v })} />
                  )}
                  <Input label="Qty" type="number" min="1" value={row.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="h-10 w-10 flex items-center justify-center text-slate-700 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
            <Plus size={14} /> Add item
          </Button>

          <div className="flex justify-between pt-3 border-t border-slate-100 font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-sm p-5">
          <Textarea label="Note (optional)" rows={2} placeholder="e.g. paid by cash, delivered by hand" value={buyer.note} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} />
        </div>

        <Switch
          checked={buyer.delivered}
          onChange={(delivered) => setBuyer((b) => ({ ...b, delivered }))}
          label="This order has already been delivered"
          description={buyer.delivered ? "Recorded straight to delivered - no shipping steps in between." : "Recorded as processing, same as a fresh online order."}
        />

        <Button type="submit" loading={submitting} fullWidth>Record order</Button>
      </form>
    </div>
  );
}
