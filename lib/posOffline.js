"use client";
import { barcodeMatches, normalizeBarcode } from "./barcode.js";
// Keeps the register usable when the network drops:
//  - a queue of completed sales that couldn't reach the server, flushed
//    to /pos/sales (with their original idempotencyKey, so replays
//    dedupe) once the browser is back online;
//  - a local copy of the product catalogue so search + barcode scan
//    still work offline.
// Both live in one IndexedDB so there's a single schema/version to keep
// straight. Oversells are expected and fine: the POS sale route
// decrements stock unguarded (allowNegative), so a sale rung against a
// stale count just takes stock negative for the vendor to correct.

const DB_NAME = "storezn-pos";
const VERSION = 3;
const QUEUE = "sale-queue";
const CATALOG = "catalog";
const META = "catalog-meta";
const HELD = "held-sales";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: "id" }).createIndex("storeId", "storeId");
      }
      let catalogStore;
      if (!db.objectStoreNames.contains(CATALOG)) {
        catalogStore = db.createObjectStore(CATALOG, { keyPath: "_key" });
        catalogStore.createIndex("storeId", "storeId");
        catalogStore.createIndex("storeSku", ["storeId", "skuLower"]);
      } else {
        catalogStore = req.transaction.objectStore(CATALOG);
      }
      if (!catalogStore.indexNames.contains("scope")) {
        catalogStore.createIndex("scope", "scope");
      }
      if (!catalogStore.indexNames.contains("scopeSku")) {
        catalogStore.createIndex("scopeSku", ["scope", "skuLower"]);
      }
      // Version 2 stored one unscoped catalogue per store. It cannot be
      // trusted for a register branch, so remove it during the upgrade
      // instead of leaving a duplicate catalogue occupying device space.
      const oldCatalogCursor = catalogStore.openCursor();
      oldCatalogCursor.onsuccess = () => {
        const cursor = oldCatalogCursor.result;
        if (!cursor) return;
        if (!cursor.value?.scope) cursor.delete();
        cursor.continue();
      };
      let metaStore;
      if (!db.objectStoreNames.contains(META)) {
        metaStore = db.createObjectStore(META, { keyPath: "storeId" });
      } else {
        metaStore = req.transaction.objectStore(META);
      }
      const oldMetaCursor = metaStore.openCursor();
      oldMetaCursor.onsuccess = () => {
        const cursor = oldMetaCursor.result;
        if (!cursor) return;
        if (!cursor.value?.actualStoreId) cursor.delete();
        cursor.continue();
      };
      if (!db.objectStoreNames.contains(HELD)) {
        const os = db.createObjectStore(HELD, { keyPath: "id" });
        os.createIndex("storeSession", ["storeId", "sessionId"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

const txDone = (tx) =>
  new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

/* ------------------------------- queue -------------------------------- */

export async function enqueueSale(storeId, payload, queuedById = null, queuedByName = null) {
  const db = await openDb();
  // queuedByName is display-only: another cashier's sale can never be
  // pushed from this device (the server books takings against whoever is
  // signed in), so the queue has to be able to say whose it is.
  const rec = { id: payload.idempotencyKey, storeId, queuedById, queuedByName, payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: null };
  await wrap(db.transaction(QUEUE, "readwrite").objectStore(QUEUE).put(rec));
  db.close();
  return rec;
}

export async function listQueuedSales(storeId) {
  const db = await openDb();
  const all = await wrap(db.transaction(QUEUE, "readonly").objectStore(QUEUE).index("storeId").getAll(storeId));
  db.close();
  return all.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueuedSale(id) {
  const db = await openDb();
  await wrap(db.transaction(QUEUE, "readwrite").objectStore(QUEUE).delete(id));
  db.close();
}

/* ---------------------------- held carts ----------------------------- */

export async function saveHeldSale(storeId, sessionId, sale) {
  const db = await openDb();
  const record = {
    ...sale,
    id: sale.id || crypto.randomUUID(),
    storeId,
    sessionId,
    createdAt: sale.createdAt || new Date().toISOString(),
  };
  await wrap(db.transaction(HELD, "readwrite").objectStore(HELD).put(record));
  db.close();
  return record;
}

export async function listHeldSales(storeId, sessionId) {
  const db = await openDb();
  const rows = await wrap(
    db.transaction(HELD, "readonly").objectStore(HELD).index("storeSession").getAll([storeId, sessionId]),
  );
  db.close();
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function removeHeldSale(id) {
  const db = await openDb();
  await wrap(db.transaction(HELD, "readwrite").objectStore(HELD).delete(id));
  db.close();
}

// Records the outcome of one sync attempt.
//
// `countAttempt` is deliberately NOT always true. `attempts` drives the
// retry backoff (up to 30 minutes) and the "stuck" counter the cashier is
// warned about - and a dead uplink is neither the sale's fault nor
// something a longer wait fixes. Counting connectivity failures meant a
// till on bad wifi reached a 30-minute backoff within a couple of minutes
// and then sat on perfectly good sales long after the network returned.
async function recordAttempt(id, { error = null, countAttempt = true, terminal = false } = {}) {
  const db = await openDb();
  const os = db.transaction(QUEUE, "readwrite").objectStore(QUEUE);
  const rec = await wrap(os.get(id));
  if (rec) {
    if (countAttempt) rec.attempts = (rec.attempts || 0) + 1;
    rec.lastError = error || null;
    rec.lastAttemptAt = new Date().toISOString();
    if (terminal) {
      rec.status = "rejected";
      rec.rejectedAt = new Date().toISOString();
      rec.rejectedReason = error || "The server rejected this sale";
    }
    await wrap(os.put(rec));
  }
  db.close();
}

// A sale the server refused (bad data, a shift it can't belong to, a
// price the cashier isn't allowed to set). Retrying on a timer can never
// change the answer, so it stops being retried and is surfaced to the
// cashier instead - otherwise it sits in the queue forever, keeping every
// close provisional and the sync badge permanently non-zero.
// 408/429 are excluded: those genuinely do want a retry.
function isTerminalRejection(err) {
  const status = Number(err?.status);
  if (!Number.isFinite(status)) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const isRejected = (rec) => rec?.status === "rejected";

// Marks a sale as being POSTed live right now, so the background flush
// doesn't send a second copy of it concurrently. Persisted rather than
// held in module state: a tab that dies mid-POST must not strand the sale
// behind a claim nothing will ever release (see the TTL in runFlush).
export async function claimSale(id) {
  const db = await openDb();
  const os = db.transaction(QUEUE, "readwrite").objectStore(QUEUE);
  const rec = await wrap(os.get(id));
  if (rec) {
    rec.liveAttemptAt = new Date().toISOString();
    await wrap(os.put(rec));
  }
  db.close();
}

export async function releaseSale(id) {
  const db = await openDb();
  const os = db.transaction(QUEUE, "readwrite").objectStore(QUEUE);
  const rec = await wrap(os.get(id));
  if (rec) {
    rec.liveAttemptAt = null;
    await wrap(os.put(rec));
  }
  db.close();
}

export async function retryRejectedSales(storeId, apiFetch, actorId = null) {
  return flushQueue(storeId, apiFetch, { force: true, actorId, includeRejected: true });
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true; // fetch() itself rejected
  return /failed to fetch|networkerror|load failed|network request failed|couldn't reach the server|check your internet connection/i.test(
    err.message || "",
  );
}

// Removes each sale the server accepts (created OR replayed). Stops at
// the first network error (still offline). A server rejection (bad data,
// closed session) stays queued with its attempt count bumped. Returns
// { synced, remaining, stuck }.
const activeFlushes = new Map();

// How long a live POST is assumed to still be in flight. Past this the
// claim is treated as stale (the tab died) and the sale is flushed
// normally, so a claim can never strand money.
const LIVE_CLAIM_TTL_MS = 90_000;

async function runFlush(storeId, apiFetch, force, actorId, includeRejected) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const all = await listQueuedSales(storeId);
    return { synced: 0, remaining: all.length, stuck: 0, blocked: 0, rejected: all.filter(isRejected).length };
  }
  const queued = await listQueuedSales(storeId);
  let synced = 0;
  let blocked = 0;
  for (const rec of queued) {
    if (rec.queuedById && actorId && rec.queuedById !== actorId) {
      blocked += 1;
      continue;
    }
    if (isRejected(rec) && !includeRejected) continue;
    // completeSale is POSTing this exact sale right now. Sending a second
    // copy is not just wasteful: the queued payload carries
    // capturedLineTotal while the live one is server-priced, so whichever
    // commits first decides the receipt total and can land the sale in the
    // owner's price-drift review for a sale that was never offline.
    if (rec.liveAttemptAt && Date.now() - new Date(rec.liveAttemptAt).getTime() < LIVE_CLAIM_TTL_MS) continue;
    if (!force && rec.attempts > 0 && rec.lastAttemptAt) {
      const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(rec.attempts - 1, 6));
      if (Date.now() - new Date(rec.lastAttemptAt).getTime() < backoffMs) continue;
    }
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, { method: "POST", body: JSON.stringify(rec.payload) });
      await removeQueuedSale(rec.id);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        // Not this sale's fault and not something backoff fixes.
        await recordAttempt(rec.id, { error: err?.message || "sync failed", countAttempt: false });
        break;
      }
      if (isTerminalRejection(err)) {
        await recordAttempt(rec.id, { error: err?.message || "The server rejected this sale", terminal: true });
        continue;
      }
      await recordAttempt(rec.id, { error: err?.message || "sync failed" });
    }
  }
  const rest = await listQueuedSales(storeId);
  return {
    synced,
    remaining: rest.length,
    stuck: rest.filter((r) => !isRejected(r) && r.attempts >= 3).length,
    blocked,
    rejected: rest.filter(isRejected).length,
  };
}

export function flushQueue(storeId, apiFetch, { force = false, actorId = null, includeRejected = false } = {}) {
  const running = activeFlushes.get(storeId);
  // A forced caller must never be handed an unforced run's promise. The
  // Sync button is the cashier's only lever, and returning the in-flight
  // tick made it a silent no-op precisely when the queue was backed off -
  // the one situation someone presses it.
  if (running && (running.force || !force)) return running.promise;
  const entry = { force };
  entry.promise = (running ? running.promise.catch(() => {}) : Promise.resolve())
    .then(() => runFlush(storeId, apiFetch, force, actorId, includeRejected))
    .finally(() => {
      // Identity-guarded: a newer entry may have superseded this one.
      if (activeFlushes.get(storeId) === entry) activeFlushes.delete(storeId);
    });
  activeFlushes.set(storeId, entry);
  return entry.promise;
}

/* ------------------------------ catalogue ---------------------------- */

const catalogScope = (storeId, branchId) => `${storeId}:${branchId || "all"}`;

export async function saveCatalog(storeId, products, branchId = null) {
  const db = await openDb();
  const tx = db.transaction([CATALOG, META], "readwrite");
  const os = tx.objectStore(CATALOG);
  const scope = catalogScope(storeId, branchId);
  const keys = await wrap(os.index("scope").getAllKeys(scope));
  for (const k of keys) os.delete(k);
  for (const p of products) {
    os.put({ ...p, _key: `${scope}:${p.id}`, scope, storeId, branchId, skuLower: normalizeBarcode(p.sku) });
  }
  tx.objectStore(META).put({ storeId: scope, actualStoreId: storeId, branchId, count: products.length, complete: true, savedAt: new Date().toISOString() });
  await txDone(tx);
  db.close();
}

export async function clearCatalog(storeId) {
  const db = await openDb();
  const tx = db.transaction([CATALOG, META], "readwrite");
  const catalogStore = tx.objectStore(CATALOG);
  const metaStore = tx.objectStore(META);
  const [catalogKeys, metadata] = await Promise.all([
    wrap(catalogStore.index("storeId").getAllKeys(storeId)),
    wrap(metaStore.getAll()),
  ]);
  for (const key of catalogKeys) catalogStore.delete(key);
  for (const row of metadata) {
    if (row.actualStoreId === storeId || row.storeId === storeId) metaStore.delete(row.storeId);
  }
  await txDone(tx);
  db.close();
}

export async function catalogMeta(storeId, branchId = null) {
  let db;
  try {
    db = await openDb();
    const scope = catalogScope(storeId, branchId);
    const [meta, actualCount] = await Promise.all([
      wrap(db.transaction(META, "readonly").objectStore(META).get(scope)),
      wrap(db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("scope").count(scope)),
    ]);
    if (!meta) return null;
    return {
      ...meta,
      actualCount,
      complete: meta.complete === true && Number(meta.count) === actualCount,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function readCatalogSnapshot(db, storeId, branchId) {
  const readScope = async (scope) => {
    const [products, meta] = await Promise.all([
      wrap(db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("scope").getAll(scope)),
      wrap(db.transaction(META, "readonly").objectStore(META).get(scope)),
    ]);
    const complete = meta?.complete === true && Number(meta.count) === products.length;
    return { products, complete };
  };

  const branchSnapshot = await readScope(catalogScope(storeId, branchId));
  if (!branchId || branchSnapshot.complete) return branchSnapshot.products;

  // A branch snapshot created by an older client may be incomplete. Prefer a
  // complete store-wide snapshot when one exists, but keep the branch rows as
  // a last resort so a legacy device does not lose every offline product.
  const storeSnapshot = await readScope(catalogScope(storeId, null));
  if (storeSnapshot.complete || (branchSnapshot.products.length === 0 && storeSnapshot.products.length > 0)) {
    return storeSnapshot.products;
  }
  return branchSnapshot.products;
}

export async function searchCatalog(storeId, q, limit = 12, branchId = null) {
  const result = await searchCatalogPage(storeId, q, { page: 1, pageSize: limit, branchId });
  return result.products;
}

// Offline search mirrors the server's paginated product list. The previous
// implementation silently capped search results at 200 (and an empty search
// at 100), so a valid product could be absent from the offline picker even
// though it was present in the saved catalogue.
export async function searchCatalogPage(storeId, q, { page = 1, pageSize = 20, branchId = null } = {}) {
  const db = await openDb();
  let all;
  try {
    all = await readCatalogSnapshot(db, storeId, branchId);
  } finally {
    db.close();
  }
  const term = normalizeBarcode(q);
  const rows = term
    ? all.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.skuLower?.includes(term) ||
          p.offlineVariants?.some((variant) => (variant.sku || "").toLowerCase().includes(term)),
      )
    : all;
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const start = (safePage - 1) * safePageSize;
  return {
    products: rows.slice(start, start + safePageSize),
    total: rows.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(rows.length / safePageSize)),
  };
}

export async function findBySku(storeId, sku, branchId = null) {
  const db = await openDb();
  let all;
  try {
    all = await readCatalogSnapshot(db, storeId, branchId);
  } finally {
    db.close();
  }
  let hit = null;
  for (const product of all) {
    const variant = product.offlineVariants?.find((row) => barcodeMatches(row.sku, sku));
    if (variant) {
      hit = { ...product, _matchedVariant: variant };
      break;
    }
    if (barcodeMatches(product.sku, sku)) {
      hit = product;
      break;
    }
  }
  return hit || null;
}

export async function getCatalogProduct(storeId, productId, branchId = null) {
  let db;
  try {
    db = await openDb();
    const products = await readCatalogSnapshot(db, storeId, branchId);
    return products.find((product) => product.id === productId) || null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/* --------------------- explicit "set up offline" -------------------- */

function askSw(reg, message) {
  return new Promise((resolve) => {
    const target = reg.active || navigator.serviceWorker.controller;
    if (!target) return resolve(null);
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    target.postMessage(message, [ch.port2]);
    setTimeout(() => resolve(null), 20000);
  });
}

// Proactively caches the register screen and every static file it has
// already pulled, so a fresh reload works offline straight away (rather
// than only after the route has been visited post-deploy). Returns
// { swReady, cached }.
export async function prepareOfflineShell() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { swReady: false, cached: 0 };
  }
  let reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
    if (reg) await navigator.serviceWorker.ready.catch(() => {});
  }
  if (!reg) return { swReady: false, cached: 0 };
  await reg.update().catch(() => {});

  const origin = location.origin;
  const assets = [
    ...new Set(
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((n) => n.startsWith(origin) && /\/_next\/(static|image)|\.(?:js|mjs|css|woff2?)(?:\?|$)/.test(n)),
    ),
  ];
  const urls = [...assets, `${origin}/vendor/pos`, `${origin}/manifest.json`];

  const res = await askSw(reg, { type: "PRECACHE", urls });
  return { swReady: !!navigator.serviceWorker.controller, cached: res?.cached ?? 0, total: urls.length };
}
