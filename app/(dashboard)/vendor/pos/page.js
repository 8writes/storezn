"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
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
import { isOffline, onConnectivityChange } from "@/lib/connectivity.js";
import { networkErrorMessage } from "@/lib/fetchError.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import {
  enqueueSale,
  flushQueue,
  listHeldSales,
  listQueuedSales,
  removeHeldSale,
  removeQueuedSale,
  clearCatalog,
  saveCatalog,
  saveHeldSale,
  catalogMeta,
} from "@/lib/posOffline.js";
import { Minus, Plus, Trash2, ShoppingCart, Pause, RotateCcw, X } from "lucide-react";

const isNetErr = (err) => !err || (!err?.status && !!networkErrorMessage(err));

function storageGet(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage availability must never decide whether the register opens.
  }
}

function storageJson(key, fallback = null) {
  try {
    return JSON.parse(storageGet(key, "null"));
  } catch {
    return fallback;
  }
}

async function timedApiFetch(apiFetch, url, options = {}, timeoutMs = 6_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
    const cached = storageJson("pos_stores", []);
    if (Array.isArray(cached) && cached.length) {
      Promise.resolve().then(() => {
        setStores(cached);
        setStoreId((current) => current || cached[0].id);
        setLoading(false);
      });
    }
    timedApiFetch(apiFetch, "/api/v1/vendor/stores")
      .then((data) => {
        const rows = Array.isArray(data?.stores) ? data.stores : [];
        storageSet("pos_stores", JSON.stringify(rows));
        setStores(rows);
        if (rows.length > 0) setStoreId((current) => current || rows[0].id);
        else setLoading(false);
      })
      .catch((err) => {
        // Offline cold start: fall back to the last store list we saw.
        const cached = isNetErr(err) ? storageJson("pos_stores", []) : [];
        if (Array.isArray(cached) && cached.length) {
          setStores(cached);
          setStoreId(cached[0].id);
          return;
        }
        toast.error(err.message || "Failed to load your store");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeStore = stores.find((s) => s.id === storeId);
  const regCacheKey = `pos_registers_${storeId}`;

  const loadRegisters = useCallback((forceNetwork = false) => {
    if (!token || !storeId) return;
    setRegError(false);
    const cached = !forceNetwork ? storageJson(regCacheKey) : null;
    if (Array.isArray(cached)) {
      setRegisters(cached);
      setLoading(false);
    }
    return timedApiFetch(apiFetch, `/api/v1/vendor/stores/${storeId}/pos/registers`)
      .then((data) => {
        const rows = Array.isArray(data?.registers) ? data.registers : [];
        setRegisters(rows);
        storageSet(regCacheKey, JSON.stringify(rows));
      })
      .catch((error) => {
        // Keep the till usable offline: reuse the last-seen register list
        // only for a real network failure. An HTTP error or a forced stale-
        // session refresh must not resurrect an obsolete session id.
        if (forceNetwork || (error?.status && !Array.isArray(cached))) {
          setRegisters([]);
          setRegError(true);
          return;
        }
        if (Array.isArray(cached)) setRegisters(cached);
        else setRegError(true);
      })
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch, regCacheKey]);

  useEffect(() => {
    // Reset stale store data before the asynchronous register refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegisters(null);
    loadRegisters();
  }, [loadRegisters]);

  const header = (
    <PageHeader
      title="Sell"
      description="Open a register, search products, take payments, and keep offline sales queued safely."
      actions={
        stores.length > 1 ? (
          <div className="w-44">
            <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
          </div>
        ) : null
      }
    />
  );

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  if (activeStore && !isEnterpriseStore(activeStore)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackLink href="/vendor/orders" label="Back to orders" />
        <div className="bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900">In-person selling is a Storezn Enterprise feature</h1>
          <p className="text-sm text-slate-800 max-w-sm mx-auto">
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
      <BackLink href="/vendor/pos/sessions" label="Back" />
      {header}

      {loading || registers === null ? (
        <PosSkeleton />
      ) : regError ? (
        <div className="max-w-md mx-auto bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-slate-900">Couldn&apos;t load the register</h2>
          <p className="text-sm text-slate-800">Check your connection and try again.</p>
          <Button type="button" onClick={() => loadRegisters()}>
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
  const actorId = user?.id || null;
  const { confirm, confirmDialog } = useConfirm();
  const lsKey = `pos_register_${storeId}`;
  const sessionCacheKey = useCallback((sessionId) => `pos_session_${storeId}_${sessionId}`, [storeId]);

  const [sessionData, setSessionData] = useState(null); // { session, register, summary, heldSales } | null
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);

  const [cart, setCart] = useState([]); // [{ key, productId, variantId, quantity, priceOverride, lineDiscount }]
  const [details, setDetails] = useState({}); // key -> { product, variant }
  const [orderDiscount, setOrderDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [buyer, setBuyer] = useState({ name: "", phone: "", note: "" });
  const [invoiceRequest, setInvoiceRequest] = useState(null);
  const [invoiceRequestEmail, setInvoiceRequestEmail] = useState("");
  const [invoiceRequestQuantity, setInvoiceRequestQuantity] = useState(1);
  const [invoiceRequestAnswers, setInvoiceRequestAnswers] = useState({});
  const [invoiceRequestSubmitting, setInvoiceRequestSubmitting] = useState(false);
  const [saleKey, setSaleKey] = useState(null);
  const [orderNo, setOrderNo] = useState(null);
  const [editKey, setEditKey] = useState(null);
  const [recalledHeldId, setRecalledHeldId] = useState(null);

  const [tenderOpen, setTenderOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [xOpen, setXOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [holdPromptOpen, setHoldPromptOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [heldSales, setHeldSales] = useState([]);
  // "Work offline": every sale goes straight to the local queue and
  // nothing auto-syncs until the cashier taps Sync (or turns this off).
  // Persisted per device so it survives a reload / cold open.
  const offlineKey = `pos_force_offline_${storeId}`;
  const [offlineMode, setOfflineMode] = useState(
    () => typeof window !== "undefined" && storageGet(offlineKey) === "1",
  );
  const [queuedSales, setQueuedSales] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [offlineReceipt, setOfflineReceipt] = useState(null);
  const [catalog, setCatalog] = useState({ count: 0, savedAt: null, syncing: false, error: null });
  const [offlineSetupOpen, setOfflineSetupOpen] = useState(false);
  useModalScrollLock(!!invoiceRequest || !!offlineReceipt || tenderOpen || cashOpen || closeOpen || xOpen || heldOpen || holdPromptOpen || offlineSetupOpen);
  const [networkOffline, setNetworkOffline] = useState(false);
  const catalogSessionRef = useRef("");
  const catalogSyncRef = useRef(null);

  useEffect(() => {
    Promise.resolve().then(() => setNetworkOffline(isOffline()));
    return onConnectivityChange(setNetworkOffline);
  }, []);

  const openSession = sessionData?.session?.status === "open" ? sessionData : null;
  const registerBranchId = openSession?.register?.branchId || null;
  const sessionQueuedSales = useMemo(
    () => openSession ? queuedSales.filter((sale) => sale.payload?.sessionId === openSession.session.id) : [],
    [queuedSales, openSession],
  );
  const pendingSync = sessionQueuedSales.length;

  const loadLocalHeld = useCallback(async (sessionId) => {
    const rows = await listHeldSales(storeId, sessionId).catch(() => []);
    setHeldSales(rows);
    return rows;
  }, [storeId]);

  // Resume only the register this device remembers. Automatically joining
  // an arbitrary open register can put an owner on another branch's till.
  // Unknown devices choose explicitly from the open-register panel.
  const resolveActiveRegister = useCallback(() => {
    const saved = typeof window !== "undefined" ? storageGet(lsKey) : null;
    const savedRegister = registers.find((r) => r.id === saved);
    return savedRegister || null;
  }, [registers, lsKey]);

  const fetchSession = useCallback(
    async (sessionId) => {
      const cached = storageJson(sessionCacheKey(sessionId));
      if (cached?.session?.id === sessionId && cached.session.status === "open") {
        setSessionData(cached);
        setChecking(false);
        await loadLocalHeld(sessionId);
      }
      try {
        const data = await timedApiFetch(apiFetch, `/api/v1/vendor/stores/${storeId}/pos/sessions/${sessionId}`);
        setSessionData(data);
        storageSet(sessionCacheKey(sessionId), JSON.stringify(data));
        // One-time migration for carts held by the previous server-backed
        // implementation. Persist locally before deleting the server row.
        for (const held of data.heldSales || []) {
          try {
            await saveHeldSale(storeId, sessionId, { ...held, migratedFromServer: true });
            await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held/${held.id}`, { method: "DELETE" }).catch(() => {});
          } catch {
            // Keep the server copy intact if this browser cannot persist
            // it. A held-cart migration must never hide the open shift.
          }
        }
        await loadLocalHeld(sessionId);
      } catch (error) {
        if (error?.status === 404 || error?.status === 409) {
          setSessionData(null);
          storageRemove(lsKey);
          storageRemove(sessionCacheKey(sessionId));
          reloadRegisters(true).catch(() => {});
        } else if (isNetErr(error)) {
          // An offline reload has no API response to rebuild the till
          // from. Reuse the last authenticated snapshot for this exact
          // shift; all writes still queue against its server-issued ID.
          if (cached?.session?.id === sessionId && cached.session.status === "open") {
            setSessionData(cached);
            await loadLocalHeld(sessionId);
            return;
          }
          setSessionData(null);
          toast.error("This register was not prepared for an offline reload. Reconnect once to restore it.");
        } else {
          setSessionData(null);
          toast.error(error.message || "Could not load the open register");
        }
      }
    },
    [apiFetch, storeId, lsKey, reloadRegisters, sessionCacheKey, loadLocalHeld],
  );

  useEffect(() => {
    const reg = resolveActiveRegister();
    if (reg?.openSession) {
      // The callback owns the async state transition for this register.
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
  const syncNow = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      const res = await flushQueue(storeId, apiFetch, { force: force === true, actorId });
      const queue = await listQueuedSales(storeId).catch(() => []);
      setQueuedSales(queue);
      if (res.synced > 0) {
        toast.success(`${res.synced} offline sale${res.synced === 1 ? "" : "s"} synced`);
        refresh();
      }
      if (res.stuck > 0) toast.error(`${res.stuck} offline sale${res.stuck === 1 ? "" : "s"} couldn't sync - open Offline setup to review`);
      if (res.blocked > 0) toast.error(`${res.blocked} queued sale${res.blocked === 1 ? " belongs" : "s belong"} to another cashier. Sign in as that cashier to sync.`);
    } catch {
      /* still offline - try again next tick */
    } finally {
      setSyncing(false);
    }
  }, [storeId, apiFetch, refresh, actorId]);

  // Pulls the WHOLE catalogue into IndexedDB so the register's search and
  // barcode lookup keep working with no network. Skips if a snapshot
  // under 30 min old already exists (unless forced from the "Update now"
  // button).
  const runCatalogSync = useCallback(
    async (force = false) => {
      const meta = await catalogMeta(storeId, registerBranchId).catch(() => null);
      if (meta) setCatalog((c) => ({ ...c, count: meta.actualCount ?? meta.count, savedAt: meta.savedAt }));
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      if (!force && meta?.complete && Date.now() - new Date(meta.savedAt).getTime() < 30 * 60 * 1000) return true;
      setCatalog((c) => ({ ...c, syncing: true, error: null }));
      try {
        // pageSize is capped at 20 server-side (lib/pagination.js), so walk
        // the bounded pages to build the complete offline catalogue. Each page gets a couple
        // of retries so one flaky request doesn't abandon the whole sync
        // and leave the offline catalogue stale/incomplete.
        const fetchPage = async (page) => {
          for (let attempt = 0; ; attempt++) {
            try {
              const params = new URLSearchParams({ page: String(page), pageSize: "20", includeVariants: "true", status: "active", sellable: "true" });
              if (registerBranchId) params.set("branch", registerBranchId);
              return await apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params}`);
            } catch (err) {
              if (attempt >= 2) throw err;
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            }
          }
        };
        const byId = new Map();
        let expectedTotal = null;
        let expectedPages = 1;
        for (let page = 1; page <= expectedPages; page++) {
          const data = await fetchPage(page);
          const rows = Array.isArray(data?.products) ? data.products : [];
          if (data.pagination) {
            const responseTotal = Number(data.pagination.total);
            if (expectedTotal == null) {
              expectedTotal = responseTotal;
              expectedPages = Math.max(1, Number(data.pagination.totalPages) || Math.ceil(responseTotal / 20));
            } else if (responseTotal !== expectedTotal) {
              throw new Error("The product catalogue changed while downloading. Updating it again will pick up the latest products.");
            }
          }
          for (const product of rows) byId.set(product.id, product);
          if (!data.pagination || rows.length === 0) break;
        }
        const all = [...byId.values()];
        if (expectedTotal != null && all.length !== expectedTotal) {
          throw new Error("The product catalogue did not finish downloading. Reconnect and try again.");
        }
        await saveCatalog(storeId, all, registerBranchId);
        setCatalog({ count: all.length, savedAt: new Date().toISOString(), syncing: false, error: null });
        return true;
      } catch (error) {
        setCatalog((c) => ({ ...c, syncing: false, error: error?.message || "Catalogue update failed" }));
        return false;
      }
    },
    [storeId, registerBranchId, apiFetch],
  );

  const syncCatalog = useCallback((force = false) => {
    if (catalogSyncRef.current) return catalogSyncRef.current;
    const task = runCatalogSync(force).finally(() => {
      if (catalogSyncRef.current === task) catalogSyncRef.current = null;
    });
    catalogSyncRef.current = task;
    return task;
  }, [runCatalogSync]);

  const rebuildOfflineCatalog = useCallback(async () => {
    // Let any current writer finish before removing every old snapshot for
    // this store. The forced sync then starts at server page 1.
    if (catalogSyncRef.current) await catalogSyncRef.current.catch(() => {});
    await clearCatalog(storeId);
    setCatalog({ count: 0, savedAt: null, syncing: true, error: null });
    return syncCatalog(true);
  }, [storeId, syncCatalog]);

  const toggleOfflineMode = (on) => {
    // Manual offline mode can still be enabled while the device has an
    // uplink. Refresh first so newly added products and barcodes are not
    // hidden behind a snapshot that was considered fresh moments earlier.
    if (on && typeof navigator !== "undefined" && navigator.onLine !== false) {
      syncCatalog(true);
    }
    setOfflineMode(on);
    storageSet(offlineKey, on ? "1" : "0");
    if (!on) syncNow(true); // turning it off means "I'm back - push everything"
  };

  useEffect(() => {
    if (!openSession) return;
    const sessionKey = `${storeId}:${openSession.session.id}`;
    const firstSyncForSession = catalogSessionRef.current !== sessionKey;
    if (firstSyncForSession && typeof navigator !== "undefined" && navigator.onLine !== false) {
      catalogSessionRef.current = sessionKey;
    }
    listQueuedSales(storeId).then(setQueuedSales).catch(() => {});
    // Force one catalogue revalidation when this register session is first
    // opened. Later renders of the same shift use the normal 30-minute
    // freshness window instead of downloading the entire catalogue again.
    syncCatalog(firstSyncForSession && typeof navigator !== "undefined" && navigator.onLine !== false);
    const onOnline = () => {
      const needsSessionRefresh = catalogSessionRef.current !== sessionKey;
      if (needsSessionRefresh) catalogSessionRef.current = sessionKey;
      // Connectivity may return after products changed while this register
      // was disconnected, so do not trust the previous freshness window.
      syncCatalog(true);
      if (!offlineMode) syncNow();
    };
    window.addEventListener("online", onOnline);
    const catalogIv = setInterval(() => syncCatalog(), 25_000);
    let salesIv = null;
    if (!offlineMode) {
      syncNow();
      salesIv = setInterval(() => syncNow(), 25_000);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(catalogIv);
      if (salesIv) clearInterval(salesIv);
    };
  }, [openSession, storeId, offlineMode, syncNow, syncCatalog]);

  const handleOpen = async ({ registerId, openingFloat }) => {
    setOpening(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions`, {
        method: "POST",
        body: JSON.stringify({ registerId, openingFloat }),
      });
      const register = registers.find((row) => row.id === registerId);
      const bootstrap = {
        session: data.session,
        register: {
          id: registerId,
          name: register?.name || "Register",
          branchId: register?.branchId || null,
        },
        summary: null,
        heldSales: [],
      };
      storageSet(lsKey, registerId);
      storageSet(sessionCacheKey(data.session.id), JSON.stringify(bootstrap));
      setSessionData(bootstrap);
      await fetchSession(data.session.id);
      reloadRegisters();
      toast.success("Register open");
    } catch (err) {
      toast.error(err.message || "Couldn't open the register");
    } finally {
      setOpening(false);
    }
  };

  const handleResume = async ({ registerId, sessionId }) => {
    setChecking(true);
    storageSet(lsKey, registerId);
    try {
      await fetchSession(sessionId);
      reloadRegisters();
    } finally {
      setChecking(false);
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
  const requestInvoice = (product, variant) => {
    if (offlineMode) {
      toast.info("Invoice requests need a connection. Keep the product selected and reconnect to request it.");
      return;
    }
    setInvoiceRequest({ product, variant });
    setInvoiceRequestEmail("");
    setInvoiceRequestQuantity(1);
    setInvoiceRequestAnswers({});
  };
  const submitInvoiceRequest = async () => {
    if (!invoiceRequest) return;
    const { product, variant } = invoiceRequest;
    const quantity = Number(invoiceRequestQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    if (!buyer.name.trim() || !invoiceRequestEmail.trim() || !buyer.phone.trim()) {
      toast.error("Customer name, email, and phone are required");
      return;
    }
    const missingField = (Array.isArray(product.customerFields) ? product.customerFields : []).find((field) => field.required && (field.type === "checkbox" ? invoiceRequestAnswers[field.id] !== true : !String(invoiceRequestAnswers[field.id] ?? "").trim()));
    if (missingField) {
      toast.error(`${missingField.label} is required`);
      return;
    }
    const approved = await confirm({
      title: "Add this quote request?",
      description: `The request for ${quantity} item${quantity === 1 ? "" : "s"} will be added to Invoices for pricing and sending.`,
      confirmLabel: "Add request",
    });
    if (!approved) return;
    setInvoiceRequestSubmitting(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`, {
        method: "POST",
        body: JSON.stringify({
          guestEmail: invoiceRequestEmail.trim(),
          buyerName: buyer.name.trim(),
          buyerPhone: buyer.phone.trim(),
          branchId: sessionData?.register?.branchId || undefined,
          note: buyer.note || undefined,
          items: [{ productId: product.id, variantId: variant?.id || null, quantity, customerFields: invoiceRequestAnswers }],
        }),
      });
      toast.success("Invoice request added. Open Invoices to price and send it.");
      setInvoiceRequest(null);
    } catch (err) {
      toast.error(err.message || "Could not create invoice request");
    } finally {
      setInvoiceRequestSubmitting(false);
    }
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
    setRecalledHeldId(null);
  };

  const lines = useMemo(
    () =>
      cart.map((r) => {
        const det = details[r.key] || {};
        const line = { ...r, product: det.product, variant: det.variant };
        const p = linePricing(line);
        return {
          ...line,
          unit: p.unit,
          segments: p.segments,
          baseLineTotal: p.lineTotal,
          lineTotal: Math.max(0, p.lineTotal - (r.lineDiscount || 0)),
        };
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
    // Always carry a real number (a recalled held sale can reach here
    // with orderNo still null) - never serialise null into the payload.
    const num = orderNo || generateOrderNumber();
    if (num !== orderNo) setOrderNo(num);
    const key = saleKey || crypto.randomUUID();
    if (key !== saleKey) setSaleKey(key);
    const payload = {
      sessionId: openSession.session.id,
      idempotencyKey: key,
      orderNumber: num,
      soldAt,
      offlineReplay: true,
      items: lines.map((line) => ({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        quantity: line.quantity,
        capturedLineTotal: line.baseLineTotal,
        ...(line.priceOverride != null ? { unitPrice: line.priceOverride } : {}),
        ...(line.lineDiscount ? { lineDiscount: line.lineDiscount } : {}),
      })),
      tenders,
      ...(recalledHeldId ? { heldSaleId: recalledHeldId } : {}),
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
      orderNumber: num,
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

    // Write-ahead queue: persist before touching the network. If the tab,
    // browser, or device dies after payment but during the request, the sale
    // still exists locally and the same idempotency key can safely replay it.
    let recoverySaved = false;
    try {
      await enqueueSale(storeId, payload, actorId);
      recoverySaved = true;
    } catch (error) {
      if (offlineMode) {
        toast.error(error?.message || "This device could not save the sale. Keep the cart open and reconnect before taking payment.");
        setSubmitting(false);
        return;
      }
    }

    const queueIt = async (msg) => {
      if (!recoverySaved) {
        try {
          await enqueueSale(storeId, payload, actorId);
          recoverySaved = true;
        } catch (error) {
          toast.error(error?.message || "Couldn't save this sale offline. The cart has been kept.");
          setSubmitting(false);
          return false;
        }
      }
      if (recalledHeldId) {
        await removeHeldSale(recalledHeldId).catch(() => {});
        await loadLocalHeld(openSession.session.id);
      }
      setTenderOpen(false);
      resetSale();
      setOfflineReceipt({ ...receipt, pending: true });
      listQueuedSales(storeId).then(setQueuedSales).catch(() => {});
      toast.warning(msg);
      setSubmitting(false);
      return true;
    };

    // "Work offline" is on - don't even try the network.
    if (offlineMode) {
      await queueIt("Saved - tap Sync when you want to send it up");
      return;
    }

    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, {
        method: "POST",
        body: JSON.stringify({ ...payload, offlineReplay: false }),
      });
      await removeQueuedSale(payload.idempotencyKey).catch(() => {});
      if (recalledHeldId) {
        await removeHeldSale(recalledHeldId).catch(() => {});
        await loadLocalHeld(openSession.session.id);
      }
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
      if (recoverySaved) await removeQueuedSale(payload.idempotencyKey).catch(() => {});
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
    if (recalledHeldId) {
      resetSale();
      toast.success("Sale remains held");
      return;
    }
    try {
      await saveHeldSale(storeId, openSession.session.id, {
        label,
        cart: cart.map((r) => ({ ...r, _d: details[r.key] })),
        customer: buyer.name || buyer.phone ? { name: buyer.name, phone: buyer.phone } : null,
        createdBy: actorId,
      });
      resetSale();
      await loadLocalHeld(openSession.session.id);
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
    setRecalledHeldId(held.id);
    setBuyer({ name: held.customer?.name || "", phone: held.customer?.phone || "", note: "" });
    setHeldOpen(false);
  };

  const discardQueued = async (id) => {
    if (!window.confirm("Discard this queued sale? It has not reached the server and cannot be recovered.")) return;
    await removeQueuedSale(id);
    const queue = await listQueuedSales(storeId);
    setQueuedSales(queue);
  };

  const discardHeld = async (id) => {
    try {
      await removeHeldSale(id);
      await loadLocalHeld(openSession.session.id);
      // Best-effort cleanup for a record migrated from the old server
      // implementation. Local discard must still work while offline.
      apiFetch(`/api/v1/vendor/stores/${storeId}/pos/held/${id}`, { method: "DELETE" }).catch(() => {});
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
      if (err?.status === 404 || (err?.status === 409 && /session is closed|already closed/i.test(err.message || ""))) {
        setCashOpen(false);
        setSessionData(null);
        storageRemove(lsKey);
        storageRemove(sessionCacheKey(openSession.session.id));
        reloadRegisters(true).catch(() => {});
      }
      toast.error(err.message || "Couldn't record that");
    } finally {
      setCashSubmitting(false);
    }
  };

  // payload: { countedCash } | { countBreakdown } | { forced, forcedReason }
  const closeRegister = async (payload) => {
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${openSession.session.id}/close`, {
        method: "POST",
        body: JSON.stringify({ ...payload, pendingSyncCount: pendingSync }),
      });
      storageRemove(sessionCacheKey(openSession.session.id));
      storageRemove(lsKey);
      reloadRegisters();
      return data.zReport;
    } catch (error) {
      if (error?.status === 404 || (error?.status === 409 && /session is closed|already closed/i.test(error.message || ""))) {
        await reloadRegisters(true).catch(() => {});
        setSessionData(null);
        storageRemove(sessionCacheKey(openSession.session.id));
        storageRemove(lsKey);
        setCloseOpen(false);
      }
      toast.error(error.message || "Could not close the register");
      return null;
    }
  };

  if (checking) return <PosSkeleton />;

  if (!openSession) {
    return (
      <OpenRegisterPanel
        registers={registers}
        isOwner={isOwner}
        opening={opening}
        onOpen={handleOpen}
        onResume={handleResume}
      />
    );
  }

  const heldCount = heldSales.length;

  return (
    <div className="space-y-4">
      <RegisterBar
        registerName={sessionData.register.name}
        session={openSession.session}
        summary={sessionData.summary}
        heldCount={heldCount}
        pendingSync={pendingSync}
        syncing={syncing}
        onSync={() => syncNow(true)}
        offlineMode={offlineMode}
        onToggleOfflineMode={toggleOfflineMode}
        catalog={catalog}
        onOpenOfflineSetup={() => setOfflineSetupOpen(true)}
        onCashDrawer={() => setCashOpen(true)}
        onXReport={() => setXOpen(true)}
        onCloseRegister={() => setCloseOpen(true)}
        networkOffline={networkOffline}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <ProductPicker
          key={`${storeId}:${registerBranchId || "all"}:${catalog.savedAt || "empty"}`}
          storeId={storeId}
          branchId={registerBranchId}
          token={token}
          onAdd={addToCart}
          onInvoiceRequest={requestInvoice}
          cartCountByProduct={countByProduct}
          offlineMode={offlineMode}
          catalogVersion={catalog.savedAt}
        />

        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
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
                      : "text-slate-800 hover:text-slate-900"
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
              <p className="text-sm text-slate-800 px-4 py-6 text-center">Scan or tap a product to start</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[42vh] overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.key} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 leading-tight">{l.product?.name || "Item"}</p>
                        {l.variant && (
                          <p className="text-[11px] text-slate-800 truncate">
                            {Object.entries(l.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-800">
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
                  <label className="text-xs text-slate-800 w-20 shrink-0">Discount ₦</label>
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
                <div className="flex justify-between text-xs text-slate-800">
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

          <div className="bg-surface border border-slate-200 rounded-sm p-3 space-y-2">
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

      {invoiceRequest && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none">
          <div className="fixed inset-0 bg-black/50" onClick={invoiceRequestSubmitting ? undefined : () => setInvoiceRequest(null)} />
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div><p className="text-sm font-bold text-slate-900">Request invoice</p><p className="text-xs text-slate-600 mt-0.5">{invoiceRequest.product.name}{invoiceRequest.variant ? ` - ${Object.values(invoiceRequest.variant.options || {}).join(" / ")}` : ""}</p></div>
              <button type="button" aria-label="Close" disabled={invoiceRequestSubmitting} onClick={() => setInvoiceRequest(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer disabled:cursor-not-allowed"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto overscroll-contain space-y-4">
              <div className="space-y-1"><p className="text-sm font-medium text-slate-700">Quantity</p><div className="inline-grid grid-cols-[2.75rem_4rem_2.75rem] h-11 border border-slate-300 rounded-sm overflow-hidden"><button type="button" aria-label="Decrease quantity" onClick={() => setInvoiceRequestQuantity((value) => Math.max(1, Number(value) - 1))} className="grid place-items-center hover:bg-brand-50 text-brand-700 cursor-pointer"><Minus size={17} /></button><output className="grid place-items-center border-x border-slate-300 text-sm font-semibold tabular-nums">{invoiceRequestQuantity}</output><button type="button" aria-label="Increase quantity" onClick={() => setInvoiceRequestQuantity((value) => Math.min(100000, Number(value) + 1))} className="grid place-items-center hover:bg-brand-50 text-brand-700 cursor-pointer"><Plus size={17} /></button></div></div>
              <Input label="Customer name" required value={buyer.name} onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))} />
              <Input type="email" label="Customer email" required value={invoiceRequestEmail} onChange={(event) => setInvoiceRequestEmail(event.target.value)} />
              <Input type="tel" label="Customer phone or WhatsApp" required value={buyer.phone} onChange={(event) => setBuyer((current) => ({ ...current, phone: event.target.value }))} />
              {(Array.isArray(invoiceRequest.product.customerFields) ? invoiceRequest.product.customerFields : []).map((field) => (
                <div key={field.id} className="space-y-1">
                  {field.type === "checkbox" ? (
                    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={invoiceRequestAnswers[field.id] === true} onChange={(event) => setInvoiceRequestAnswers((current) => ({ ...current, [field.id]: event.target.checked }))} /><span>{field.label}{field.required ? " *" : ""}</span></label>
                  ) : <>
                    <label className="text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</label>
                    {field.type === "textarea" ? <textarea rows={3} value={invoiceRequestAnswers[field.id] || ""} placeholder={field.placeholder || ""} onChange={(event) => setInvoiceRequestAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full px-3 py-2 rounded-sm border border-slate-300 bg-surface text-base sm:text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /> : field.type === "select" ? <select value={invoiceRequestAnswers[field.id] || ""} onChange={(event) => setInvoiceRequestAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full px-3 py-2 rounded-sm border border-slate-300 bg-surface text-base sm:text-sm text-slate-900 outline-none focus:border-brand-500"><option value="">Select</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === "number" || field.type === "date" ? field.type : "text"} value={invoiceRequestAnswers[field.id] || ""} placeholder={field.placeholder || ""} onChange={(event) => setInvoiceRequestAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full px-3 py-2 rounded-sm border border-slate-300 bg-surface text-base sm:text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />}
                  </>}
                  {field.helpText && <p className="text-xs text-slate-600">{field.helpText}</p>}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <Button type="button" variant="outline" fullWidth disabled={invoiceRequestSubmitting} onClick={() => setInvoiceRequest(null)}>Cancel</Button>
              <Button type="button" fullWidth loading={invoiceRequestSubmitting} onClick={submitInvoiceRequest}>Add request</Button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
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
          onSync={() => syncNow(true)}
          onSubmit={closeRegister}
        />
      )}
      {offlineReceipt && (
        <PrintableReceipt storeName={storeName} {...offlineReceipt} onClose={() => setOfflineReceipt(null)} />
      )}
      {offlineSetupOpen && (
        <OfflineSetupModal
          storeId={storeId}
          branchId={registerBranchId}
          catalog={catalog}
          pendingSync={pendingSync}
          queuedSales={sessionQueuedSales}
          syncing={syncing}
          onSync={() => syncNow(true)}
          onDiscard={discardQueued}
          onSyncCatalog={rebuildOfflineCatalog}
          onClose={() => setOfflineSetupOpen(false)}
        />
      )}

      {xOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setXOpen(false)} />
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
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
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-xs p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">Hold this sale</p>
            <p className="text-xs text-slate-800">Give it a name so you can find it again for the customer.</p>
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
          <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Held sales</p>
              <button type="button" onClick={() => setHeldOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            {heldCount === 0 ? (
              <p className="text-sm text-slate-800 p-6 text-center">Nothing on hold</p>
            ) : (
              <ul className="overflow-y-auto divide-y divide-slate-100">
                {heldSales.map((h) => {
                  const s = heldSummary(h);
                  return (
                    <li key={h.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                          {s.hasLabel && s.preview && (
                            <p className="text-[11px] text-slate-800 truncate">{s.preview}</p>
                          )}
                          <p className="text-[11px] text-slate-800">
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
