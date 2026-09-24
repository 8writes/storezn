"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, ImageOff, Loader2, Barcode } from "lucide-react";
import { useApi } from "@/hooks/useApi.js";
import { formatCurrency } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { networkErrorMessage } from "@/lib/fetchError.js";
import { isOffline } from "@/lib/connectivity.js";
import { searchCatalog, findBySku, getCatalogProduct } from "@/lib/posOffline.js";
import { barcodeMatches, normalizeBarcode } from "@/lib/barcode.js";

const PAGE_SIZE = 24;

function isNetErr(err) {
  return !err || !!networkErrorMessage(err);
}

function hasActiveVariants(product) {
  return Number(product?.variantCount) > 0 || product?.offlineVariants?.length > 0;
}

function variantMatchingSku(product, sku) {
  if (!normalizeBarcode(sku)) return null;
  return product?.offlineVariants?.find((variant) => barcodeMatches(variant.sku, sku)) || null;
}

// Shared product search + grid for both the manual offline form and the
// live till. Handles: DB-backed paged search, a scanner fast-path (an
// exact SKU match adds qty 1 with no results list - works whether or not
// the search box is focused), the per-product variant picker, and a
// fall-back to the locally cached catalogue when the network is down.
// Calls onAdd(product, variantOrNull).
export function ProductPicker({ storeId, branchId, token, onAdd, onInvoiceRequest, cartCountByProduct, offlineMode = false, catalogVersion = null }) {
  const { apiFetch } = useApi(token);
  const [products, setProducts] = useState([]);
  const [cache, setCache] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [lowStock, setLowStock] = useState(5);
  const [variantsBy, setVariantsBy] = useState({});
  const [loadingVariantsFor, setLoadingVariantsFor] = useState(null);
  const [picker, setPicker] = useState(null);
  const [scanning, setScanning] = useState(false);
  const searchRef = useRef(null);
  const handleScanRef = useRef(null);
  const scanInFlightRef = useRef(false);
  // Guards against a slow request for an earlier term resolving after a
  // newer one and overwriting the results (very visible when the DB is
  // waking from idle and a search takes several seconds).
  const reqRef = useRef(0);

  const load = async (pageNum, q) => {
    const myReq = ++reqRef.current;
    const setBusy = pageNum === 1 ? setLoading : setLoadingMore;
    setBusy(true);
    const params = new URLSearchParams({ page: String(pageNum), pageSize: String(PAGE_SIZE), status: "active", sellable: "true" });
    if (q?.trim()) params.set("q", q.trim());
    if (branchId) params.set("branch", branchId);

    // Do not wait for fetch() to reject when the browser already knows the
    // uplink is down. The catalogue snapshot is the source for this screen
    // until connectivity returns.
    if (offlineMode || isOffline()) {
      const rows = await searchCatalog(storeId, q, q ? 200 : 100, branchId).catch(() => []);
      if (myReq === reqRef.current) {
        setProducts(rows);
        setCache((prev) => ({ ...prev, ...Object.fromEntries(rows.map((p) => [p.id, p])) }));
        setPagination(null);
        setPage(1);
      }
      if (myReq === reqRef.current) setBusy(false);
      return;
    }

    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params}`);
      if (myReq !== reqRef.current) return; // superseded
      setProducts((prev) => (pageNum === 1 ? data.products : [...prev, ...data.products]));
      setCache((prev) => ({ ...prev, ...Object.fromEntries(data.products.map((p) => [p.id, p])) }));
      setPagination(data.pagination || null);
      setPage(pageNum);
      if (data.lowStockThreshold != null) setLowStock(data.lowStockThreshold);
    } catch (err) {
      if (myReq !== reqRef.current) return;
      if (isNetErr(err)) {
        // No connection - search the catalogue snapshot instead.
        // Whole catalogue is cached; cap the grid so a 4k-SKU store
        // doesn't try to render every card, but a real search term
        // narrows it well within this anyway.
        const rows = await searchCatalog(storeId, q, q ? 200 : 100, branchId).catch(() => []);
        if (myReq !== reqRef.current) return;
        setProducts(rows);
        setCache((prev) => ({ ...prev, ...Object.fromEntries(rows.map((p) => [p.id, p])) }));
        setPagination(null);
        setPage(1);
      } else {
        toast.error(err.message || "Failed to load products");
      }
    } finally {
      if (myReq === reqRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.resolve().then(() => load(1, debounced));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, branchId, debounced, offlineMode, catalogVersion]);

  const ensureVariants = async (productId) => {
    if (variantsBy[productId]) return variantsBy[productId];
    setLoadingVariantsFor(productId);
    try {
      if (offlineMode || isOffline()) throw new Error("offline");
      const params = new URLSearchParams({ active: "true" });
      if (branchId) params.set("branch", branchId);
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants?${params}`);
      setVariantsBy((v) => ({ ...v, [productId]: data.variants }));
      return data.variants;
    } catch (error) {
      const cachedProduct = cache[productId] || await getCatalogProduct(storeId, productId, branchId);
      const cachedVariants = cachedProduct?.offlineVariants;
      if (Array.isArray(cachedVariants) && cachedVariants.length > 0) {
        setVariantsBy((v) => ({ ...v, [productId]: cachedVariants }));
        return cachedVariants;
      }
      toast.error(error?.message || "Variant choices are not available offline. Reconnect and update the offline catalogue.");
      return null;
    } finally {
      setLoadingVariantsFor(null);
    }
  };

  // Adds instantly for the common case (no options) using the
  // variantCount the list already carries - no round trip. Only a
  // product that actually has options pauses to load them.
  const tapProduct = async (product) => {
    if (loadingVariantsFor) return;
    if (product.saleMode === "invoice_required") {
      if (onInvoiceRequest) onInvoiceRequest(product, null);
      else toast.info("This product requires an invoice. Add it from the invoice workflow when connected.");
      return;
    }
    if (!hasActiveVariants(product)) {
      onAdd(product, null);
      return;
    }
    const variants = await ensureVariants(product.id);
    if (variants === null) return;
    if (variants.length === 0) onAdd(product, null);
    else setPicker(product);
  };

  const acceptHit = async (hit) => {
    setCache((prev) => ({ ...prev, [hit.id]: hit }));
    if (hit.saleMode === "invoice_required") {
      if (onInvoiceRequest) onInvoiceRequest(hit, hit._matchedVariant || null);
      else toast.info("This product requires an invoice. Add it from the invoice workflow when connected.");
      return;
    }
    if (hit._matchedVariant) {
      onAdd(hit, hit._matchedVariant);
      setSearch("");
      searchRef.current?.focus();
      return;
    }
    if (!hasActiveVariants(hit)) {
      onAdd(hit, null);
      setSearch("");
      searchRef.current?.focus();
      return;
    }
    const variants = await ensureVariants(hit.id);
    if (variants === null) return;
    if (variants.length === 0) {
      onAdd(hit, null);
      setSearch("");
      searchRef.current?.focus();
      return;
    }
    setPicker(hit);
  };

  // Scanner fast-path. Tries what's already on this device first (loaded
  // rows, then the offline catalogue snapshot) so a scan adds with no
  // network at all; only an unknown code hits the API.
  const handleScan = async (rawTerm) => {
    const term = normalizeBarcode(rawTerm ?? search);
    if (!term || scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    setScanning(true);
    try {
      const localRows = [...products, ...Object.values(cache)];
      let hit = null;
      for (const product of localRows) {
        const matchedVariant = variantMatchingSku(product, term);
        if (matchedVariant) {
          hit = { ...product, _matchedVariant: matchedVariant };
          break;
        }
        if (barcodeMatches(product.sku, term)) {
          hit = product;
          break;
        }
      }
      if (!hit) hit = await findBySku(storeId, term, branchId).catch(() => null);
      if (hit) {
        await acceptHit(hit);
        return;
      }

      if (offlineMode || isOffline()) {
        toast.error(`Nothing matches "${term}" in this branch's saved catalogue`);
        return;
      }

      try {
        const params = new URLSearchParams({ page: "1", pageSize: "5", sku: term, status: "active", sellable: "true", includeVariants: "true" });
        if (branchId) params.set("branch", branchId);
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params}`);
        const variantProduct = data.products.find((p) => variantMatchingSku(p, term));
        hit = variantProduct
          ? { ...variantProduct, _matchedVariant: variantMatchingSku(variantProduct, term) }
          : data.products.find((p) => barcodeMatches(p.sku, term)) || null;
      } catch (err) {
        if (!isNetErr(err)) throw err;
      }
      if (hit) {
        await acceptHit(hit);
        return;
      }
      toast.error(`Nothing matches "${term}"`);
    } catch (err) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
      scanInFlightRef.current = false;
    }
  };

  useEffect(() => {
    handleScanRef.current = handleScan;
  });

  // A wedge scanner types the barcode as fast keystrokes then Enter. When
  // the search box has focus its own onKeyDown handles it; otherwise this
  // catches the burst anywhere on the screen so the cashier never has to
  // click the field first.
  useEffect(() => {
    const buf = { chars: "", last: 0 };
    const onKey = (e) => {
      const el = document.activeElement;
      if (el === searchRef.current) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const now = Date.now();
      if (e.key === "Enter") {
        const code = buf.chars;
        buf.chars = "";
        if (code.length >= 4) {
          e.preventDefault();
          handleScanRef.current?.(code);
        }
        return;
      }
      if (e.key.length !== 1) return;
      if (now - buf.last > 120) buf.chars = "";
      buf.chars += e.key;
      buf.last = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [storeId]);

  // The server (or the offline catalogue) already filtered by the search
  // term; re-filtering here by the live `search` value just blanked the
  // grid for the split second `search` was ahead of the results.
  const list = products;

  return (
    <div className="space-y-4 min-w-0">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleScan();
            }
          }}
          placeholder="Scan a barcode, or search by name / SKU"
          className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500 bg-surface"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {scanning ? <Loader2 size={15} className="animate-spin" /> : <Barcode size={15} />}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-slate-100 rounded-sm animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-600 py-8 text-center">{search ? "No products match" : "No products yet"}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((p) => {
            const cartQty = cartCountByProduct?.get(p.id) || 0;
            // Parent stock does not decide availability for a product with
            // variants; each variant owns its own tracked/unlimited stock.
            const invoiceRequired = p.saleMode === "invoice_required";
            const out = !invoiceRequired && p.productType === "physical" && !hasActiveVariants(p) && p.stock === 0;
            const low = p.productType === "physical" && p.stock != null && p.stock > 0 && p.stock <= lowStock;
            const busy = loadingVariantsFor === p.id;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => tapProduct(p)}
                disabled={out || busy}
                className="relative text-left bg-surface border border-slate-200 rounded-sm overflow-hidden hover:border-brand-400 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                  {busy && (
                    <div className="absolute inset-0 bg-surface/70 flex items-center justify-center">
                      <Loader2 size={20} className="text-brand-600 animate-spin" />
                    </div>
                  )}
                  {invoiceRequired && (
                    <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                      <span className="text-xs font-semibold text-brand-700">Invoice required</span>
                    </div>
                  )}
                  {out && (
                    <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                      <span className="text-xs font-semibold text-red-600">Out of stock</span>
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium text-slate-900 line-clamp-2 leading-tight">{p.name}</p>
                  <p className="text-sm font-semibold text-brand-700">{invoiceRequired ? "Price on request" : formatCurrency(getEffectivePrice(p.price, p.discountPercent))}</p>
                  {low && <p className="text-[11px] text-amber-600 font-medium">{p.stock} left</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && pagination && products.length < pagination.total && (
        <button
          type="button"
          onClick={() => load(page + 1, debounced)}
          disabled={loadingMore}
          className="w-full py-2.5 border border-slate-300 rounded-sm text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
        >
          {loadingMore ? "Loading…" : `Load more (${products.length} of ${pagination.total})`}
        </button>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setPicker(null)} />
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900 truncate flex-1">{picker.name}</p>
              <button type="button" onClick={() => setPicker(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-slate-100">
              {(variantsBy[picker.id] || []).map((v) => {
                const vout = v.stock === 0;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={vout}
                      onClick={() => {
                        onAdd(picker, v);
                        setPicker(null);
                        setSearch("");
                        searchRef.current?.focus();
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-sm text-slate-900">
                        {Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", ")}
                        {vout && <span className="text-red-600 font-medium"> - Out of stock</span>}
                        {!vout && v.stock != null && v.stock <= lowStock && <span className="text-amber-600 font-medium"> - {v.stock} left</span>}
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
