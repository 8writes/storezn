"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/Switch.js";
import { formatCurrency } from "@/lib/format.js";
import { formatKobo } from "@/lib/money.js";
import { isPlusStore } from "@/lib/storePlan.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { ProductPicker } from "@/components/pos/ProductPicker.js";
import { RegisterBar } from "@/components/pos/RegisterBar.js";
import { OpenRegisterPanel } from "@/components/pos/OpenRegisterPanel.js";
import { TenderPanel } from "@/components/pos/TenderPanel.js";
import { CashDrawerModal } from "@/components/pos/CashDrawerModal.js";
import { CloseRegisterModal } from "@/components/pos/CloseRegisterModal.js";
import { ZReport } from "@/components/pos/ZReport.js";
import { PrintableReceipt } from "@/components/pos/PrintableReceipt.js";
import { generateOrderNumber } from "@/lib/orders.js";
import { enqueueSale, flushQueue, listQueuedSales, saveCatalog, catalogMeta } from "@/lib/posOffline.js";
import { Minus, Plus, Trash2, ShoppingCart, Pause, RotateCcw, X } from "lucide-react";

const isNetErr = (err) =>
  !err || err.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(err.message || "");

const unitNaira = (line) =>
  line.priceOverride != null
    ? line.priceOverride
    : line.variant?.price ?? (line.product ? getEffectivePrice(line.product.price, line.product.discountPercent) : 0);

export default function RecordSalePage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [registers, setRegisters] = useState(null); // null = still loading
  const [loading, setLoading] = useState(true);

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

  const activeStore = stores.find((s) => s.id === storeId);

  const loadRegisters = useCallback(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers`)
      .then((data) => setRegisters(data.registers))
      .catch(() => setRegisters([]))
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch]);

  useEffect(() => {
    setRegisters(null);
    loadRegisters();
  }, [loadRegisters]);

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  if (activeStore && !isPlusStore(activeStore)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-white border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">In-person selling is a Storezn+ feature</h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Upgrade to run a register - take sales in person with split payments, a cash drawer, and end-of-day reports.
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
        <h1 className="text-xl font-bold text-slate-900">
          {registers && registers.length > 0 ? "Sell" : "Record a sale"}
        </h1>
        {stores.length > 1 && (
          <div className="w-44">
            <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
          </div>
        )}
      </div>

      {loading || registers === null ? (
        <div className="h-64 bg-slate-100 rounded-sm animate-pulse" />
      ) : registers.length > 0 ? (
        <TillMode
          key={storeId}
          storeId={storeId}
          storeName={activeStore?.name || ""}
          token={token}
          user={user}
          apiFetch={apiFetch}
          registers={registers}
          reloadRegisters={loadRegisters}
        />
      ) : (
        <ManualMode key={storeId} storeId={storeId} token={token} user={user} apiFetch={apiFetch} isOwner={user?.role === "vendor"} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live till - a register session is required                         */
/* ------------------------------------------------------------------ */

function TillMode({ storeId, storeName, token, user, apiFetch, registers, reloadRegisters }) {
  const router = useRouter();
  const isOwner = user?.role === "vendor" || user?.role === "super_admin";
  const lsKey = `pos_register_${storeId}`;

  const [sessionData, setSessionData] = useState(null); // { session, register, summary, heldSales } | null
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);

  const [cart, setCart] = useState([]); // [{ key, productId, variantId, quantity, priceOverride, lineDiscount }]
  const [details, setDetails] = useState({}); // key -> { product, variant }
  const [orderDiscount, setOrderDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [buyer, setBuyer] = useState({ name: "", phone: "", note: "" });
  const [saleKey, setSaleKey] = useState(null);
  const [orderNo, setOrderNo] = useState(null);
  const [editKey, setEditKey] = useState(null);

  const [tenderOpen, setTenderOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [xOpen, setXOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [offlineReceipt, setOfflineReceipt] = useState(null);

  const openSession = sessionData?.session?.status === "open" ? sessionData : null;

  // Find the register we should try to run: the last one used on this
  // device, else the first that already has an open session, else none.
  const resolveActiveRegister = useCallback(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(lsKey) : null;
    const withOpen = registers.find((r) => r.openSession);
    return registers.find((r) => r.id === saved) || withOpen || null;
  }, [registers, lsKey]);

  const fetchSession = useCallback(
    async (sessionId) => {
      try {
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${sessionId}`);
        setSessionData(data);
      } catch {
        setSessionData(null);
      }
    },
    [apiFetch, storeId],
  );

  useEffect(() => {
    const reg = resolveActiveRegister();
    if (reg?.openSession) {
      fetchSession(reg.openSession.id).finally(() => setChecking(false));
    } else {
      setSessionData(null);
      setChecking(false);
    }
  }, [resolveActiveRegister, fetchSession]);

  const refresh = useCallback(() => {
    if (openSession) fetchSession(openSession.session.id);
    reloadRegisters();
  }, [openSession, fetchSession, reloadRegisters]);

  // Push any sales that were completed while offline, and (best-effort)
  // keep a local catalogue snapshot fresh so search/scan survive a drop.
  const syncNow = useCallback(async () => {
    try {
      const res = await flushQueue(storeId, apiFetch);
      setPendingSync(res.remaining);
      if (res.synced > 0) {
        toast.success(`${res.synced} offline sale${res.synced === 1 ? "" : "s"} synced`);
        refresh();
      }
      if (res.stuck > 0) toast.error(`${res.stuck} offline sale${res.stuck === 1 ? "" : "s"} couldn't sync - check Orders`);
    } catch {
      /* still offline - try again next tick */
    }
  }, [storeId, apiFetch, refresh]);

  const syncCatalog = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const meta = await catalogMeta(storeId).catch(() => null);
    if (meta && Date.now() - new Date(meta.savedAt).getTime() < 6 * 60 * 60 * 1000) return;
    try {
      const all = [];
      for (let page = 1; page <= 60; page++) {
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products?page=${page}&pageSize=200`);
        all.push(...data.products);
        if (!data.pagination || all.length >= data.pagination.total || data.products.length === 0) break;
      }
      await saveCatalog(storeId, all);
    } catch {
      /* leave whatever snapshot we already have */
    }
  }, [storeId, apiFetch]);

  useEffect(() => {
    if (!openSession) return;
    listQueuedSales(storeId).then((q) => setPendingSync(q.length)).catch(() => {});
    syncNow();
    syncCatalog();
    const onOnline = () => syncNow();
    window.addEventListener("online", onOnline);
    const iv = setInterval(syncNow, 25_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(iv);
    };
  }, [openSession, storeId, syncNow, syncCatalog]);

  const handleOpen = async ({ registerId, openingFloat }) => {
    setOpening(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions`, {
        method: "POST",
        body: JSON.stringify({ registerId, openingFloat }),
      });
      localStorage.setItem(lsKey, registerId);
      await fetchSession(data.session.id);
      reloadRegisters();
      toast.success("Register open");
    } catch (err) {
      toast.error(err.message || "Couldn't open the register");
    } finally {
      setOpening(false);
    }
  };

  /* ---- cart ---- */
  const addToCart = (product, variant) => {
    const key = `${product.id}:${variant?.id || ""}`;
    setDetails((d) => ({ ...d, [key]: { product, variant } }));
    setSaleKey((k) => k || crypto.randomUUID());
    setOrderNo((n) => n || generateOrderNumber());
    setCart((rows) => {
      const found = rows.find((r) => r.key === key);
      if (found) return rows.map((r) => (r.key === key ? { ...r, quantity: r.quantity + 1 } : r));
      return [...rows, { key, productId: product.id, variantId: variant?.id || null, quantity: 1, priceOverride: null, lineDiscount: 0 }];
    });
  };
  const setQty = (key, q) =>
    setCart((rows) => (q <= 0 ? rows.filter((r) => r.key !== key) : rows.map((r) => (r.key === key ? { ...r, quantity: q } : r))));
  const patchLine = (key, patch) => setCart((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const resetSale = () => {
    setCart([]);
    setOrderDiscount("");
    setDiscountReason("");
    setBuyer({ name: "", phone: "", note: "" });
    setSaleKey(null);
    setOrderNo(null);
    setEditKey(null);
  };

  const lines = useMemo(
    () =>
      cart.map((r) => {
        const det = details[r.key] || {};
        const line = { ...r, product: det.product, variant: det.variant };
        const unit = unitNaira(line);
        return { ...line, unit, lineTotal: Math.max(0, unit * r.quantity - (r.lineDiscount || 0)) };
      }),
    [cart, details],
  );
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discountNum = Math.min(Number(orderDiscount || 0), subtotal);
  const total = Math.max(0, subtotal - discountNum);
  const countByProduct = useMemo(() => {
    const m = new Map();
    for (const l of lines) m.set(l.productId, (m.get(l.productId) || 0) + l.quantity);
    return m;
  }, [lines]);

  /* ---- actions ---- */
  const completeSale = async (tenders) => {
    setSubmitting(true);
    const soldAt = new Date().toISOString();
    const payload = {
      sessionId: openSession.session.id,
      idempotencyKey: saleKey,
      orderNumber: orderNo,
      soldAt,
      items: cart.map((r) => ({
        productId: r.productId,
        ...(r.variantId ? { variantId: r.variantId } : {}),
        quantity: r.quantity,
        ...(r.priceOverride != null ? { unitPrice: r.priceOverride } : {}),
        ...(r.lineDiscount ? { lineDiscount: r.lineDiscount } : {}),
      })),
      tenders,
    };
    if (buyer.name) payload.buyerName = buyer.name;
    if (buyer.phone) payload.buyerPhone = buyer.phone;
    if (buyer.note) payload.note = buyer.note;
    if (discountNum > 0) {
      payload.discountAmount = discountNum;
      if (discountReason) payload.discountReason = discountReason;
    }

    // Snapshot for the printable receipt - built the same way whether the
    // sale reaches the server now or is queued for later.
    const receipt = {
      orderNumber: orderNo,
      soldAt,
      lines: lines.map((l) => ({
        name: l.product?.name || "Item",
        variantLabel: l.variant ? Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
        quantity: l.quantity,
        unitPrice: l.unit,
        lineTotal: l.lineTotal,
        priceOverridden: l.priceOverride != null,
      })),
      tenders,
      subtotal,
      discount: discountNum,
      total,
      note: buyer.note || null,
    };

    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, { method: "POST", body: JSON.stringify(payload) });
      setTenderOpen(false);
      resetSale();
      refresh();
      toast.success("Sale complete");
      router.push(`/vendor/orders/${data.order.id}/receipt?storeId=${storeId}`);
    } catch (err) {
      if (isNetErr(err) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        await enqueueSale(storeId, payload).catch(() => {});
        setTenderOpen(false);
        resetSale();
        setOfflineReceipt({ ...receipt, pending: true });
        listQueuedSales(storeId).then((q) => setPendingSync(q.length)).catch(() => {});
        toast.warning("Saved offline - it'll sync when you're back online");
      } else {
        toast.error(err.message || "Couldn't complete the sale");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const holdSale = async () => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: openSession.session.id,
          label: buyer.name || "",
          cart: cart.map((r) => ({ ...r, _d: details[r.key] })),
          customer: buyer.name || buyer.phone ? { name: buyer.name, phone: buyer.phone } : null,
        }),
      });
      resetSale();
      refresh();
      toast.success("Sale held");
    } catch (err) {
      toast.error(err.message || "Couldn't hold the sale");
    }
  };

  const recall = async (held) => {
    const rows = [];
    const det = {};
    for (const r of held.cart || []) {
      const { _d, ...rest } = r;
      rows.push({ ...rest, priceOverride: rest.priceOverride ?? null, lineDiscount: rest.lineDiscount ?? 0 });
      if (_d) det[rest.key] = _d;
    }
    setCart(rows);
    setDetails(det);
    setSaleKey(crypto.randomUUID());
    setBuyer({ name: held.customer?.name || "", phone: held.customer?.phone || "", note: "" });
    setHeldOpen(false);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held/${held.id}`, { method: "DELETE" });
      refresh();
    } catch {
      /* keeping the cart is what matters */
    }
  };

  const discardHeld = async (id) => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      toast.error(err.message || "Couldn't discard");
    }
  };

  const submitCashMovement = async ({ kind, amount, reason }) => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${openSession.session.id}/movements`, {
        method: "POST",
        body: JSON.stringify({ kind, amount, reason }),
      });
      setCashOpen(false);
      refresh();
      toast.success("Recorded");
    } catch (err) {
      toast.error(err.message || "Couldn't record that");
    }
  };

  const closeRegister = async (countedCash) => {
    const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${openSession.session.id}/close`, {
      method: "POST",
      body: JSON.stringify({ countedCash }),
    });
    reloadRegisters();
    return data.zReport;
  };

  if (checking) return <div className="h-64 bg-slate-100 rounded-sm animate-pulse" />;

  if (!openSession) {
    return (
      <OpenRegisterPanel
        registers={registers}
        isOwner={isOwner}
        opening={opening}
        onOpen={handleOpen}
      />
    );
  }

  const heldCount = sessionData.heldSales?.length || 0;

  return (
    <div className="space-y-4">
      <RegisterBar
        registerName={sessionData.register.name}
        session={openSession.session}
        summary={sessionData.summary}
        heldCount={heldCount}
        pendingSync={pendingSync}
        onSync={syncNow}
        onCashDrawer={() => setCashOpen(true)}
        onXReport={() => setXOpen(true)}
        onCloseRegister={() => setCloseOpen(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <ProductPicker storeId={storeId} token={token} onAdd={addToCart} cartCountByProduct={countByProduct} />

        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ShoppingCart size={15} className="text-slate-400" /> Current sale
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setHeldOpen(true)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Held{heldCount ? ` (${heldCount})` : ""}
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={holdSale}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1"
                  >
                    <Pause size={12} /> Hold
                  </button>
                )}
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-slate-500 px-4 py-6 text-center">Scan or tap a product to start</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[42vh] overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.key} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 leading-tight">{l.product?.name || "Item"}</p>
                        {l.variant && (
                          <p className="text-[11px] text-slate-500 truncate">
                            {Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500">
                          {formatCurrency(l.unit)} each
                          {l.priceOverride != null && <span className="text-amber-600"> · overridden</span>}
                          {l.lineDiscount > 0 && <span className="text-amber-600"> · −{formatCurrency(l.lineDiscount)}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 border border-slate-300 rounded-sm shrink-0">
                        <button type="button" onClick={() => setQty(l.key, l.quantity - 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                          <Minus size={11} />
                        </button>
                        <span className="w-5 text-center text-xs tabular-nums">{l.quantity}</span>
                        <button type="button" onClick={() => setQty(l.key, l.quantity + 1)} className="h-6 w-6 flex items-center justify-center hover:bg-slate-50 cursor-pointer">
                          <Plus size={11} />
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-slate-900 tabular-nums w-16 text-right shrink-0">{formatCurrency(l.lineTotal)}</span>
                      <button type="button" onClick={() => setQty(l.key, 0)} className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {isOwner && (
                      <div className="mt-1.5">
                        {editKey === l.key ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="Unit price"
                              defaultValue={l.priceOverride ?? ""}
                              onBlur={(e) => patchLine(l.key, { priceOverride: e.target.value === "" ? null : Number(e.target.value) })}
                              className="w-24 px-2 py-1 border border-slate-300 rounded-sm text-xs outline-none focus:border-brand-500"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="Line disc."
                              defaultValue={l.lineDiscount || ""}
                              onBlur={(e) => patchLine(l.key, { lineDiscount: Number(e.target.value || 0) })}
                              className="w-24 px-2 py-1 border border-slate-300 rounded-sm text-xs outline-none focus:border-brand-500"
                            />
                            <button type="button" onClick={() => setEditKey(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setEditKey(l.key)} className="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer">
                            Adjust price / discount
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isOwner && lines.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 w-20 shrink-0">Discount ₦</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-2 py-1 border border-slate-300 rounded-sm text-xs outline-none focus:border-brand-500"
                  />
                </div>
                {discountNum > 0 && (
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason for the discount"
                    className="w-full px-2 py-1 border border-slate-300 rounded-sm text-xs outline-none focus:border-brand-500"
                  />
                )}
              </div>
            )}

            <div className="px-4 py-3 border-t border-slate-100 space-y-1">
              {discountNum > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {discountNum > 0 && (
                <div className="flex justify-between text-xs text-amber-600">
                  <span>Discount</span>
                  <span className="tabular-nums">−{formatCurrency(discountNum)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-900">
                <span className="text-sm">Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-3 space-y-2">
            <Input label="Customer name (optional)" value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} />
            <Input label="Phone (optional)" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} />
          </div>

          <Button type="button" fullWidth size="lg" disabled={lines.length === 0} onClick={() => setTenderOpen(true)}>
            Pay{lines.length > 0 ? ` · ${formatCurrency(total)}` : ""}
          </Button>
        </div>
      </div>

      {tenderOpen && (
        <TenderPanel
          open
          onClose={() => setTenderOpen(false)}
          total={total}
          submitting={submitting}
          onComplete={completeSale}
        />
      )}
      {cashOpen && <CashDrawerModal open onClose={() => setCashOpen(false)} onSubmit={submitCashMovement} />}
      {closeOpen && (
        <CloseRegisterModal
          open
          onClose={() => setCloseOpen(false)}
          expectedCashKobo={sessionData.summary?.drawer?.expectedCash ?? 0}
          heldCount={heldCount}
          onSubmit={closeRegister}
        />
      )}
      {offlineReceipt && (
        <PrintableReceipt storeName={storeName} {...offlineReceipt} onClose={() => setOfflineReceipt(null)} />
      )}

      {xOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setXOpen(false)} />
          <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Register status</p>
              <button type="button" onClick={() => setXOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <ZReport summary={sessionData.summary} />
            </div>
            <div className="p-4 border-t border-slate-100">
              <Button type="button" variant="outline" fullWidth onClick={() => window.print()}>
                Print X report
              </Button>
            </div>
          </div>
        </div>
      )}

      {heldOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setHeldOpen(false)} />
          <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Held sales</p>
              <button type="button" onClick={() => setHeldOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            {heldCount === 0 ? (
              <p className="text-sm text-slate-500 p-6 text-center">Nothing on hold</p>
            ) : (
              <ul className="overflow-y-auto divide-y divide-slate-100">
                {sessionData.heldSales.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{h.label || "Held sale"}</p>
                      <p className="text-[11px] text-slate-500">
                        {(h.cart?.length || 0)} item{(h.cart?.length || 0) === 1 ? "" : "s"} ·{" "}
                        {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => recall(h)} className="text-xs font-semibold text-brand-700 hover:text-brand-800 cursor-pointer">
                        Recall
                      </button>
                      <button type="button" onClick={() => discardHeld(h.id)} className="text-slate-400 hover:text-red-600 cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manual mode - no register, back-dating a sale (the original flow)  */
/* ------------------------------------------------------------------ */

function ManualMode({ storeId, token, user, apiFetch, isOwner }) {
  const router = useRouter();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [cart, setCart] = useState([]);
  const [details, setDetails] = useState({});
  const [buyer, setBuyer] = useState({ buyerName: "Walk In Customer", buyerPhone: "", buyerEmail: "", note: "", delivered: true });
  const [submitting, setSubmitting] = useState(false);

  const branchScoped = user?.role === "staff" && !!user?.branchId;

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
        const unit = det.variant?.price ?? (det.product ? getEffectivePrice(det.product.price, det.product.discountPercent) : 0);
        return { ...r, product: det.product, variant: det.variant, unit, lineTotal: unit * r.quantity };
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
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/offline`, { method: "POST", body: JSON.stringify(payload) });
      toast.success("Sale recorded");
      router.push(`/vendor/orders/${data.order.id}?storeId=${storeId}`);
    } catch (err) {
      toast.error(err.message || "Failed to record");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 flex items-center justify-between gap-2">
          <span>You&apos;re recording a past sale. To run a real till - split payments, a cash drawer, Z reports -</span>
          <Link href="/vendor/pos/registers" className="font-semibold text-brand-700 hover:text-brand-800 whitespace-nowrap">
            set up a register →
          </Link>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-slate-700">Record an offline order</h2>
        <InfoTip>For a sale that already happened - in person, by phone, or by transfer. Recorded as paid, stock deducted right away.</InfoTip>
        {branches.length > 1 && (
          <div className="w-44 ml-auto">
            <Select options={branches.map((b) => ({ value: b.id, label: b.name }))} value={branchId} onChange={setBranchId} required />
          </div>
        )}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <ProductPicker storeId={storeId} token={token} onAdd={addToCart} cartCountByProduct={countByProduct} />

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <p className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <ShoppingCart size={16} className="text-slate-400" /> Current sale
            </p>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500 px-4 py-6 text-center">Tap a product to add it</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900 truncate">{l.product?.name || "Item"}</p>
                      {l.variant && (
                        <p className="text-[11px] text-slate-500 truncate">
                          {Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500">{formatCurrency(l.unit)} each</p>
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

          <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Customer</p>
            <Input label="Name" value={buyer.buyerName} onChange={(e) => setBuyer((b) => ({ ...b, buyerName: e.target.value }))} required />
            <Input label="Phone (optional)" value={buyer.buyerPhone} onChange={(e) => setBuyer((b) => ({ ...b, buyerPhone: e.target.value }))} />
            <Input label="Email (optional)" type="email" value={buyer.buyerEmail} onChange={(e) => setBuyer((b) => ({ ...b, buyerEmail: e.target.value }))} />
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <Textarea label="Note (optional)" rows={2} value={buyer.note} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} />
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4">
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
