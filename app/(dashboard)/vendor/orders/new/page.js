"use client";
import { useEffect, useMemo, useState } from "react";
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
import { Search, Plus, Minus, Trash2, X, ImageOff, ShoppingCart, Loader2 } from "lucide-react";
import Link from "next/link";

const EMPTY_BUYER = { buyerName: "Walk In Customer", buyerEmail: "", buyerPhone: "", note: "", delivered: true };

export default function RecordOfflineOrderPage() {
  const router = useRouter();
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState([]);
  const [productPage, setProductPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [variantsByProduct, setVariantsByProduct] = useState({});
  const [loadingVariantsFor, setLoadingVariantsFor] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{ key, productId, variantId, quantity }]
  const [pickerProduct, setPickerProduct] = useState(null);

  const [buyer, setBuyer] = useState(EMPTY_BUYER);

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

  // Products load a page at a time and APPEND (never reset) so a product
  // sitting in the cart is always still resolvable in `products` even
  // after paging further - see cartLines below.
  const PAGE_SIZE = 40;
  const loadProductPage = (pageNum) => {
    const setBusy = pageNum === 1 ? setLoading : setLoadingMore;
    setBusy(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?page=${pageNum}&pageSize=${PAGE_SIZE}`)
      .then((data) => {
        setProducts((prev) => (pageNum === 1 ? data.products : [...prev, ...data.products]));
        setPagination(data.pagination || null);
        setProductPage(pageNum);
        if (data.lowStockThreshold != null) setLowStockThreshold(data.lowStockThreshold);
      })
      .catch((err) => toast.error(err.message || "Failed to load products"))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (!token || !storeId) return;
    setProducts([]);
    setProductPage(1);
    setPagination(null);
    loadProductPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

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

  // Resets the whole sale (cart + picked product/branch selectors stay,
  // only the ticket itself clears) whenever the vendor switches store -
  // items from one store's catalog make no sense against another.
  useEffect(() => {
    setCart([]);
  }, [storeId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [products, search]);

  const ensureVariants = async (productId) => {
    if (variantsByProduct[productId]) return variantsByProduct[productId];
    setLoadingVariantsFor(productId);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`);
      setVariantsByProduct((v) => ({ ...v, [productId]: data.variants }));
      return data.variants;
    } catch {
      setVariantsByProduct((v) => ({ ...v, [productId]: [] }));
      return [];
    } finally {
      setLoadingVariantsFor(null);
    }
  };

  const addToCart = (product, variant) => {
    const key = `${product.id}:${variant?.id || ""}`;
    setCart((rows) => {
      const existing = rows.find((r) => r.key === key);
      if (existing) return rows.map((r) => (r.key === key ? { ...r, quantity: r.quantity + 1 } : r));
      return [...rows, { key, productId: product.id, variantId: variant?.id || null, quantity: 1 }];
    });
  };

  // Tapping a card is the whole interaction: a simple product (no
  // variants) goes straight into the cart, one tap = one unit, tap again
  // to bump the quantity. A product WITH variants opens the quick picker
  // below instead - we only find out which case this is once the variant
  // list loads (lazily, then cached), so there's a brief per-product
  // loading state on the card itself rather than a separate spinner.
  const handleProductTap = async (product) => {
    if (loadingVariantsFor) return;
    const variants = await ensureVariants(product.id);
    if (variants.length === 0) addToCart(product, null);
    else setPickerProduct(product);
  };

  const updateCartQty = (key, quantity) => {
    if (quantity <= 0) {
      setCart((rows) => rows.filter((r) => r.key !== key));
      return;
    }
    setCart((rows) => rows.map((r) => (r.key === key ? { ...r, quantity } : r)));
  };

  const cartLines = useMemo(
    () =>
      cart.map((row) => {
        const product = products.find((p) => p.id === row.productId);
        const variant = row.variantId ? (variantsByProduct[row.productId] || []).find((v) => v.id === row.variantId) : null;
        const unitPrice = variant?.price ?? (product ? getEffectivePrice(product.price, product.discountPercent) : 0);
        return { ...row, product, variant, unitPrice, lineTotal: unitPrice * row.quantity };
      }),
    [cart, products, variantsByProduct],
  );
  const total = cartLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const cartCountByProduct = useMemo(() => {
    const map = new Map();
    for (const line of cartLines) map.set(line.productId, (map.get(line.productId) || 0) + line.quantity);
    return map;
  }, [cartLines]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cartLines.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        buyerName: buyer.buyerName,
        delivered: buyer.delivered,
        items: cartLines.map((l) => ({
          productId: l.productId,
          ...(l.variantId ? { variantId: l.variantId } : {}),
          quantity: l.quantity,
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
    <div className="max-w-6xl mx-auto space-y-6">
      <BackLink href="/vendor/orders" label="Back to orders" />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
          Record an offline order
          <InfoTip>
            For a sale that happened in person, by phone, or in cash - not through your storefront checkout. It&apos;s recorded as paid immediately and stock is deducted right away.
          </InfoTip>
        </h1>
        {(stores.length > 1 || branches.length > 1) && (
          <div className="flex gap-3">
            {stores.length > 1 && (
              <div className="w-44">
                <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
              </div>
            )}
            {branches.length > 1 && (
              <div className="w-44">
                <Select options={branches.map((b) => ({ value: b.id, label: b.name }))} value={branchId} onChange={setBranchId} required />
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ---- Product picker ---- */}
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name or SKU..."
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500 bg-white"
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square bg-slate-100 rounded-sm animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-slate-700 py-8 text-center">{search ? "No products match your search" : "No products yet"}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((p) => {
                const cartQty = cartCountByProduct.get(p.id) || 0;
                const isOutOfStock = p.productType === "physical" && p.stock === 0;
                const isLowStock = p.productType === "physical" && p.stock != null && p.stock > 0 && p.stock <= lowStockThreshold;
                const isLoadingThis = loadingVariantsFor === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleProductTap(p)}
                    disabled={isOutOfStock || isLoadingThis}
                    className="relative text-left bg-white border border-slate-200 rounded-sm overflow-hidden hover:border-brand-400 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer group"
                  >
                    {cartQty > 0 && (
                      <span className="absolute top-1.5 right-1.5 z-10 min-w-5 h-5 px-1 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                        {cartQty}
                      </span>
                    )}
                    <div className="aspect-square bg-slate-100 flex items-center justify-center relative">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff size={22} className="text-slate-300" />
                      )}
                      {isLoadingThis && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 size={20} className="text-brand-600 animate-spin" />
                        </div>
                      )}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                          <span className="text-xs font-semibold text-red-600">Out of stock</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-0.5">
                      <p className="text-xs font-medium text-slate-900 line-clamp-2 leading-tight">{p.name}</p>
                      <p className="text-sm font-semibold text-brand-700">{formatCurrency(getEffectivePrice(p.price, p.discountPercent))}</p>
                      {isLowStock && <p className="text-[11px] text-amber-600 font-medium">{p.stock} left</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && pagination && products.length < pagination.total && (
            <div className="pt-1 space-y-1">
              <button
                type="button"
                onClick={() => loadProductPage(productPage + 1)}
                disabled={loadingMore}
                className="w-full py-2.5 border border-slate-300 rounded-sm text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {loadingMore ? "Loading…" : `Load more (${products.length} of ${pagination.total})`}
              </button>
              {search.trim() && (
                <p className="text-xs text-slate-400 text-center">Searching the {products.length} loaded products - load more to search the rest.</p>
              )}
            </div>
          )}
        </div>

        {/* ---- Current sale ---- */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <p className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <ShoppingCart size={16} className="text-slate-400" />
              Current sale
            </p>

            {cartLines.length === 0 ? (
              <p className="text-sm text-slate-700 px-4 py-6 text-center">Tap a product to add it</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {cartLines.map((l) => (
                  <li key={l.key} className="flex items-center gap-2.5 px-4 py-2.5">
                    {l.product?.images?.[0] ? (
                      <img src={l.product.images[0]} alt="" className="w-10 h-10 rounded-sm object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-sm bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">
                        <ImageOff size={14} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900 truncate">{l.product?.name || "Unknown product"}</p>
                      {l.variant && (
                        <p className="text-[11px] text-slate-500 truncate">
                          {Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500">{formatCurrency(l.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 border border-slate-300 rounded-sm shrink-0">
                      <button type="button" onClick={() => updateCartQty(l.key, l.quantity - 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                        <Minus size={11} />
                      </button>
                      <span className="w-4 text-center text-xs">{l.quantity}</span>
                      <button type="button" onClick={() => updateCartQty(l.key, l.quantity + 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                        <Plus size={11} />
                      </button>
                    </div>
                    <button type="button" onClick={() => updateCartQty(l.key, 0)} className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0">
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

          <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Customer</p>
            <Input label="Name" value={buyer.buyerName} onChange={(e) => setBuyer((b) => ({ ...b, buyerName: e.target.value }))} required />
            <Input label="Phone (optional)" value={buyer.buyerPhone} onChange={(e) => setBuyer((b) => ({ ...b, buyerPhone: e.target.value }))} />
            <Input label="Email (optional)" type="email" value={buyer.buyerEmail} onChange={(e) => setBuyer((b) => ({ ...b, buyerEmail: e.target.value }))} />
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <Textarea label="Note (optional)" rows={2} placeholder="e.g. paid by cash, delivered by hand" value={buyer.note} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} />
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <Switch
              checked={buyer.delivered}
              onChange={(delivered) => setBuyer((b) => ({ ...b, delivered }))}
              label="Already delivered"
              description={buyer.delivered ? "Recorded straight to delivered." : "Recorded as processing, same as a fresh online order."}
            />
          </div>

          <Button type="submit" loading={submitting} disabled={cartLines.length === 0} fullWidth size="lg">
            Record sale{cartLines.length > 0 ? ` · ${formatCurrency(total)}` : ""}
          </Button>
        </div>
      </form>

      {/* ---- Variant picker ---- */}
      {pickerProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setPickerProduct(null)} />
          <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-slate-100">
              {pickerProduct.images?.[0] ? (
                <img src={pickerProduct.images[0]} alt="" className="w-12 h-12 rounded-sm object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-sm bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">
                  <ImageOff size={16} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{pickerProduct.name}</p>
                <p className="text-xs text-slate-500">Choose an option</p>
              </div>
              <button type="button" onClick={() => setPickerProduct(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
                <X size={18} />
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-slate-100">
              {(variantsByProduct[pickerProduct.id] || []).map((v) => {
                const out = v.stock === 0;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => {
                        addToCart(pickerProduct, v);
                        setPickerProduct(null);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-sm text-slate-900">
                        {Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", ")}
                        {out && <span className="text-red-600 font-medium"> - Out of stock</span>}
                        {!out && v.stock != null && v.stock <= lowStockThreshold && <span className="text-amber-600 font-medium"> - {v.stock} left</span>}
                      </span>
                      <span className="text-sm font-semibold text-brand-700 shrink-0">{formatCurrency(v.price)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
