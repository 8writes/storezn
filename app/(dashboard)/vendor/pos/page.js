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
import { BackLink } from "@/components/ui/BackLink.js";
import { formatCurrency, formatClockTime } from "@/lib/format.js";
import { formatKobo } from "@/lib/money.js";
import { isEnterpriseStore } from "@/lib/storePlan.js";
import { computeWholesalePrice } from "@/lib/pricing.js";
import { ProductPicker } from "@/components/pos/ProductPicker.js";
import { RegisterBar } from "@/components/pos/RegisterBar.js";
import { OpenRegisterPanel } from "@/components/pos/OpenRegisterPanel.js";
import { PosSkeleton } from "@/components/pos/PosSkeleton.js";
import { TenderPanel } from "@/components/pos/TenderPanel.js";
import { CashDrawerModal } from "@/components/pos/CashDrawerModal.js";
import { CloseRegisterModal } from "@/components/pos/CloseRegisterModal.js";
import { ZReport } from "@/components/pos/ZReport.js";
import { PrintableReceipt } from "@/components/pos/PrintableReceipt.js";
import { OfflineSetupModal } from "@/components/pos/OfflineSetupModal.js";
import { generateOrderNumber } from "@/lib/orders.js";
import { enqueueSale, flushQueue, listQueuedSales, saveCatalog, catalogMeta } from "@/lib/posOffline.js";
import { Minus, Plus, Trash2, ShoppingCart, Pause, RotateCcw, X } from "lucide-react";

const isNetErr = (err) =>
  !err || err.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(err.message || "");

// Catalogue pricing for one cart line, before any line discount. An
// owner price override and a variant's own price are flat (unit x qty);
// otherwise bundle/wholesale pricing gives a line total that isn't a
// single unit x qty (whole bundles at the bundle rate, leftovers at full
// price) plus the segments to show the cashier how it breaks down.
const linePricing = (line, qty = line.quantity || 1) => {
  if (line.priceOverride != null) {
    const u = Number(line.priceOverride);
    return { lineTotal: u * qty, unit: u, segments: [] };
  }
  if (line.variant?.price != null) {
    return { lineTotal: line.variant.price * qty, unit: line.variant.price, segments: [] };
  }
  if (!line.product) return { lineTotal: 0, unit: 0, segments: [] };
  const w = computeWholesalePrice(line.product, qty);
  return { lineTotal: w.total, unit: w.unitAverage, segments: w.segments };
};

const unitNaira = (line, qty = line.quantity || 1) => linePricing(line, qty).unit;

// A held sale is a client-cart snapshot ([{...cartRow, _d:{product,variant}}]).
// Reconstruct a name, an item preview and the total so the cashier can
// pick the right one back out for a returning customer.
function heldSummary(h) {
  const rows = Array.isArray(h.cart) ? h.cart : [];
  let total = 0;
  const names = [];
  for (const r of rows) {
    const d = r._d || {};
    const p = linePricing({ priceOverride: r.priceOverride, variant: d.variant, product: d.product }, r.quantity || 1);
    total += Math.max(0, p.lineTotal - (r.lineDiscount || 0));
    const nm = d.product?.name;
    if (nm) names.push((r.quantity || 1) > 1 ? `${r.quantity}× ${nm}` : nm);
  }
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");
  const label = (h.label || "").trim() || (h.customer?.name || "").trim();
  return {
    title: label || preview || "Held sale",
    hasLabel: !!label,
    preview,
    total,
    itemCount: rows.reduce((s, r) => s + (r.quantity || 1), 0),
  };
}

// The in-person register. Its own route (was tangled into
// /vendor/orders/new with the manual "record a past sale" form, which
// meant a failed register fetch dumped you into the wrong screen).
export default function SellPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [registers, setRegisters] = useState(null); // null = still loading
  const [regError, setRegError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        try {
          localStorage.setItem("pos_stores", JSON.stringify(data.stores));
        } catch {
          /* private mode */
        }
        setStores(data.stores);
        if (data.stores.length > 0) setStoreId(data.stores[0].id);
        else setLoading(false);
      })
      .catch((err) => {
        // Offline cold start: fall back to the last store list we saw.
        try {
          const cached = JSON.parse(localStorage.getItem("pos_stores") || "[]");
          if (cached.length) {
            setStores(cached);
            setStoreId(cached[0].id);
            return;
          }
        } catch {
          /* ignore */
        }
        toast.error(err.message || "Failed to load your store");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeStore = stores.find((s) => s.id === storeId);
  const regCacheKey = `pos_registers_${storeId}`;

  const loadRegisters = useCallback(() => {
    if (!token || !storeId) return;
    setRegError(false);
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/registers`)
      .then((data) => {
        setRegisters(data.registers);
        try {
          localStorage.setItem(regCacheKey, JSON.stringify(data.registers));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        // Keep the till usable offline: reuse the last-seen register list
        // rather than bailing to an error screen.
        let cached = null;
        try {
          cached = JSON.parse(localStorage.getItem(regCacheKey) || "null");
        } catch {
          cached = null;
        }
        if (cached) setRegisters(cached);
        else setRegError(true);
      })
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch, regCacheKey]);

  useEffect(() => {
    setRegisters(null);
    loadRegisters();
  }, [loadRegisters]);

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-xl font-bold text-slate-900">Sell</h1>
      {stores.length > 1 && (
        <div className="w-44">
          <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}
    </div>
  );

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  if (activeStore && !isEnterpriseStore(activeStore)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-white border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">In-person selling is a Storezn Enterprise feature</h1>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Run a register to take sales in person - item-by-item ring-up, cash drawer, POS-machine and transfer payments,
            shift Z-reports, and offline mode. Enterprise is set up by the Storezn team.
          </p>
          <Link href="/vendor/plus" className="inline-block">
            <Button type="button">See Enterprise</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackLink href="/vendor/pos/sessions" label="Back to history" />
      {header}

      {loading || registers === null ? (
        <PosSkeleton />
      ) : regError ? (
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-slate-900">Couldn&apos;t load the register</h2>
          <p className="text-sm text-slate-500">Check your connection and try again.</p>
          <Button type="button" onClick={loadRegisters}>
            Retry
          </Button>
        </div>
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
        <OpenRegisterPanel registers={[]} isOwner={user?.role === "vendor"} opening={false} onOpen={() => {}} />
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
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [xOpen, setXOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [holdPromptOpen, setHoldPromptOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  // "Work offline": every sale goes straight to the local queue and
  // nothing auto-syncs until the cashier taps Sync (or turns this off).
  // Persisted per device so it survives a reload / cold open.
  const offlineKey = `pos_force_offline_${storeId}`;
  const [offlineMode, setOfflineMode] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(offlineKey) === "1",
  );
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [offlineReceipt, setOfflineReceipt] = useState(null);
  const [catalog, setCatalog] = useState({ count: 0, savedAt: null, syncing: false });
  const [offlineSetupOpen, setOfflineSetupOpen] = useState(false);

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
    setSyncing(true);
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
    } finally {
      setSyncing(false);
    }
  }, [storeId, apiFetch, refresh]);

  // Pulls the WHOLE catalogue into IndexedDB so the register's search and
  // barcode lookup keep working with no network. Skips if a snapshot
  // under 30 min old already exists (unless forced from the "Update now"
  // button).
  const syncCatalog = useCallback(
    async (force = false) => {
      const meta = await catalogMeta(storeId).catch(() => null);
      if (meta) setCatalog((c) => ({ ...c, count: meta.count, savedAt: meta.savedAt }));
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!force && meta && Date.now() - new Date(meta.savedAt).getTime() < 30 * 60 * 1000) return;
      setCatalog((c) => ({ ...c, syncing: true }));
      try {
        // pageSize is capped at 100 server-side (lib/pagination.js), so
        // ask for exactly that - up to 50k SKUs. Each page gets a couple
        // of retries so one flaky request doesn't abandon the whole sync
        // and leave the offline catalogue stale/incomplete.
        const fetchPage = async (page) => {
          for (let attempt = 0; ; attempt++) {
            try {
              return await apiFetch(`/api/v1/vendor/stores/${storeId}/products?page=${page}&pageSize=100`);
            } catch (err) {
              if (attempt >= 2) throw err;
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            }
          }
        };
        const all = [];
        for (let page = 1; page <= 500; page++) {
          const data = await fetchPage(page);
          all.push(...data.products);
          if (!data.pagination || all.length >= data.pagination.total || data.products.length === 0) break;
        }
        await saveCatalog(storeId, all);
        setCatalog({ count: all.length, savedAt: new Date().toISOString(), syncing: false });
      } catch {
        setCatalog((c) => ({ ...c, syncing: false }));
      }
    },
    [storeId, apiFetch],
  );

  const toggleOfflineMode = (on) => {
    setOfflineMode(on);
    try {
      localStorage.setItem(offlineKey, on ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (!on) syncNow(); // turning it off means "I'm back - push everything"
  };

  useEffect(() => {
    if (!openSession) return;
    listQueuedSales(storeId).then((q) => setPendingSync(q.length)).catch(() => {});
    syncCatalog();
    // In "work offline" mode nothing auto-syncs - the cashier drives it
    // with the Sync button. The catalogue still refreshes (read-only).
    if (offlineMode) return;
    syncNow();
    const onOnline = () => {
      syncNow();
      syncCatalog();
    };
    window.addEventListener("online", onOnline);
    const iv = setInterval(() => {
      syncNow();
      syncCatalog();
    }, 25_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(iv);
    };
  }, [openSession, storeId, offlineMode, syncNow, syncCatalog]);

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
        const p = linePricing(line);
        return { ...line, unit: p.unit, segments: p.segments, lineTotal: Math.max(0, p.lineTotal - (r.lineDiscount || 0)) };
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
        segments: Array.isArray(l.segments) && l.segments.length > 1 ? l.segments : null,
      })),
      tenders,
      subtotal,
      discount: discountNum,
      total,
      note: buyer.note || null,
    };

    const queueIt = async (msg) => {
      await enqueueSale(storeId, payload).catch(() => {});
      setTenderOpen(false);
      resetSale();
      setOfflineReceipt({ ...receipt, pending: true });
      listQueuedSales(storeId).then((q) => setPendingSync(q.length)).catch(() => {});
      toast.warning(msg);
      setSubmitting(false);
    };

    // "Work offline" is on - don't even try the network.
    if (offlineMode) {
      await queueIt("Saved - tap Sync when you want to send it up");
      return;
    }

    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, { method: "POST", body: JSON.stringify(payload) });
      setTenderOpen(false);
      resetSale();
      refresh();
      toast.success("Sale complete");
      router.push(`/vendor/orders/${data.order.id}/receipt?storeId=${storeId}`);
    } catch (err) {
      if (isNetErr(err) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        await queueIt("Saved offline - it'll sync when you're back online");
        return;
      }
      toast.error(err.message || "Couldn't complete the sale");
    } finally {
      setSubmitting(false);
    }
  };

  // Ask for a quick tag so it's identifiable later ("Chidi", "guy in
  // blue"). Pre-filled with the customer name or the first item.
  const openHoldPrompt = () => {
    const firstItem = lines[0]?.product?.name || "";
    setHoldLabel(buyer.name || firstItem);
    setHoldPromptOpen(true);
  };

  const holdSale = async (labelArg) => {
    const label = (labelArg ?? holdLabel ?? "").trim();
    setHoldPromptOpen(false);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: openSession.session.id,
          label,
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

  const submitCashMovement = async ({ kind, amount, reason, clientRef }) => {
    if (cashSubmitting) return;
    setCashSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${openSession.session.id}/movements`, {
        method: "POST",
        body: JSON.stringify({ kind, amount, reason, clientRef }),
      });
      setCashOpen(false);
      refresh();
      toast.success(res?.replayed ? "Already recorded" : "Recorded");
    } catch (err) {
      toast.error(err.message || "Couldn't record that");
    } finally {
      setCashSubmitting(false);
    }
  };

  // payload: { countedCash } | { countBreakdown } | { forced, forcedReason }
  const closeRegister = async (payload) => {
    const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${openSession.session.id}/close`, {
      method: "POST",
      body: JSON.stringify({ ...payload, pendingSyncCount: pendingSync }),
    });
    reloadRegisters();
    return data.zReport;
  };

  if (checking) return <PosSkeleton />;

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
        syncing={syncing}
        onSync={syncNow}
        offlineMode={offlineMode}
        onToggleOfflineMode={toggleOfflineMode}
        catalog={catalog}
        onOpenOfflineSetup={() => setOfflineSetupOpen(true)}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHeldOpen(true)}
                  className={`text-xs font-semibold cursor-pointer inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 ${
                    heldCount
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <RotateCcw size={12} /> Held{heldCount ? ` · ${heldCount}` : ""}
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={openHoldPrompt}
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
                        {Array.isArray(l.segments) && l.segments.length > 1 && (
                          <p className="text-[11px] text-emerald-700">
                            {l.segments
                              .map((s) => `${s.quantity} × ${formatCurrency(s.unitPrice)}${s.bundleSize ? " (bundle)" : ""}`)
                              .join(" + ")}
                          </p>
                        )}
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
      {cashOpen && (
        <CashDrawerModal
          open
          onClose={() => !cashSubmitting && setCashOpen(false)}
          onSubmit={submitCashMovement}
          submitting={cashSubmitting}
        />
      )}
      {closeOpen && (
        <CloseRegisterModal
          open
          onClose={() => setCloseOpen(false)}
          expectedCashKobo={sessionData.summary?.drawer?.expectedCash ?? 0}
          heldCount={heldCount}
          pendingSync={pendingSync}
          syncing={syncing}
          onSync={syncNow}
          onSubmit={closeRegister}
        />
      )}
      {offlineReceipt && (
        <PrintableReceipt storeName={storeName} {...offlineReceipt} onClose={() => setOfflineReceipt(null)} />
      )}
      {offlineSetupOpen && (
        <OfflineSetupModal
          storeId={storeId}
          catalog={catalog}
          pendingSync={pendingSync}
          onSyncCatalog={() => syncCatalog(true)}
          onClose={() => setOfflineSetupOpen(false)}
        />
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

      {holdPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setHoldPromptOpen(false)} />
          <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-xs p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">Hold this sale</p>
            <p className="text-xs text-slate-500">Give it a name so you can find it again for the customer.</p>
            <input
              autoFocus
              type="text"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && holdSale()}
              placeholder="e.g. Chidi, or 'guy in blue'"
              className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" fullWidth onClick={() => setHoldPromptOpen(false)}>
                Cancel
              </Button>
              <Button type="button" fullWidth onClick={() => holdSale()}>
                Hold
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
                {sessionData.heldSales.map((h) => {
                  const s = heldSummary(h);
                  return (
                    <li key={h.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                          {s.hasLabel && s.preview && (
                            <p className="text-[11px] text-slate-500 truncate">{s.preview}</p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            {s.itemCount} item{s.itemCount === 1 ? "" : "s"} · {formatCurrency(s.total)} ·{" "}
                            {formatClockTime(h.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => discardHeld(h.id)}
                          className="text-slate-300 hover:text-red-600 cursor-pointer shrink-0 mt-0.5"
                          title="Discard"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => recall(h)}
                        className="mt-2 w-full rounded-sm bg-brand-600 text-white text-sm font-semibold py-1.5 hover:bg-brand-700 cursor-pointer"
                      >
                        Recall this sale
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
