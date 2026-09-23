"use client";
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
const VERSION = 2;
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
      if (!db.objectStoreNames.contains(CATALOG)) {
        const os = db.createObjectStore(CATALOG, { keyPath: "_key" });
        os.createIndex("storeId", "storeId");
        os.createIndex("storeSku", ["storeId", "skuLower"]);
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "storeId" });
      }
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

export async function enqueueSale(storeId, payload, queuedById = null) {
  const db = await openDb();
  const rec = { id: payload.idempotencyKey, storeId, queuedById, payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: null };
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

async function bumpAttempt(id, error) {
  const db = await openDb();
  const os = db.transaction(QUEUE, "readwrite").objectStore(QUEUE);
  const rec = await wrap(os.get(id));
  if (rec) {
    rec.attempts += 1;
    rec.lastError = error || null;
    rec.lastAttemptAt = new Date().toISOString();
    await wrap(os.put(rec));
  }
  db.close();
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

async function runFlush(storeId, apiFetch, force, actorId) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, remaining: (await listQueuedSales(storeId)).length, stuck: 0 };
  }
  const queued = await listQueuedSales(storeId);
  let synced = 0;
  let blocked = 0;
  for (const rec of queued) {
    if (rec.queuedById && actorId && rec.queuedById !== actorId) {
      blocked += 1;
      continue;
    }
    if (!force && rec.attempts > 0 && rec.lastAttemptAt) {
      const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(rec.attempts - 1, 6));
      if (Date.now() - new Date(rec.lastAttemptAt).getTime() < backoffMs) continue;
    }
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, { method: "POST", body: JSON.stringify(rec.payload) });
      await removeQueuedSale(rec.id);
      synced += 1;
    } catch (err) {
      await bumpAttempt(rec.id, err?.message || "sync failed");
      if (isNetworkError(err)) break;
    }
  }
  const rest = await listQueuedSales(storeId);
  return { synced, remaining: rest.length, stuck: rest.filter((r) => r.attempts >= 3).length, blocked };
}

export function flushQueue(storeId, apiFetch, { force = false, actorId = null } = {}) {
  const running = activeFlushes.get(storeId);
  if (running) return running;
  const promise = runFlush(storeId, apiFetch, force, actorId).finally(() => activeFlushes.delete(storeId));
  activeFlushes.set(storeId, promise);
  return promise;
}

/* ------------------------------ catalogue ---------------------------- */

export async function saveCatalog(storeId, products) {
  const db = await openDb();
  const tx = db.transaction([CATALOG, META], "readwrite");
  const os = tx.objectStore(CATALOG);
  const keys = await wrap(os.index("storeId").getAllKeys(storeId));
  for (const k of keys) os.delete(k);
  for (const p of products) {
    os.put({ ...p, _key: `${storeId}:${p.id}`, storeId, skuLower: (p.sku || "").toLowerCase() });
  }
  tx.objectStore(META).put({ storeId, count: products.length, savedAt: new Date().toISOString() });
  await txDone(tx);
  db.close();
}

export async function catalogMeta(storeId) {
  try {
    const db = await openDb();
    const meta = await wrap(db.transaction(META, "readonly").objectStore(META).get(storeId));
    db.close();
    return meta || null;
  } catch {
    return null;
  }
}

export async function searchCatalog(storeId, q, limit = 12) {
  const db = await openDb();
  const all = await wrap(db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("storeId").getAll(storeId));
  db.close();
  const term = (q || "").trim().toLowerCase();
  const rows = term
    ? all.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.skuLower?.includes(term) ||
          p.offlineVariants?.some((variant) => (variant.sku || "").toLowerCase().includes(term)),
      )
    : all;
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows.slice(0, limit);
}

export async function findBySku(storeId, sku) {
  const db = await openDb();
  let hit = await wrap(
    db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("storeSku").get([storeId, (sku || "").toLowerCase()]),
  );
  if (!hit) {
    const all = await wrap(db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("storeId").getAll(storeId));
    const wanted = (sku || "").toLowerCase();
    for (const product of all) {
      const variant = product.offlineVariants?.find((row) => (row.sku || "").toLowerCase() === wanted);
      if (variant) {
        hit = { ...product, _matchedVariant: variant };
        break;
      }
    }
  }
  db.close();
  return hit || null;
}

export async function getCatalogProduct(storeId, productId) {
  try {
    const db = await openDb();
    const product = await wrap(db.transaction(CATALOG, "readonly").objectStore(CATALOG).get(`${storeId}:${productId}`));
    db.close();
    return product || null;
  } catch {
    return null;
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
  const urls = [...assets, `${origin}/vendor/orders/new`, `${origin}/manifest.json`];

  const res = await askSw(reg, { type: "PRECACHE", urls });
  return { swReady: !!navigator.serviceWorker.controller, cached: res?.cached ?? 0, total: urls.length };
}
