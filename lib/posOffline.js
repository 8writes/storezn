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
const VERSION = 1;
const QUEUE = "sale-queue";
const CATALOG = "catalog";
const META = "catalog-meta";

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

export async function enqueueSale(storeId, payload) {
  const db = await openDb();
  const rec = { id: payload.idempotencyKey, storeId, payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: null };
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

async function removeQueued(id) {
  const db = await openDb();
  await wrap(db.transaction(QUEUE, "readwrite").objectStore(QUEUE).delete(id));
  db.close();
}

async function bumpAttempt(id, error) {
  const db = await openDb();
  const os = db.transaction(QUEUE, "readwrite").objectStore(QUEUE);
  const rec = await wrap(os.get(id));
  if (rec) {
    rec.attempts += 1;
    rec.lastError = error || null;
    await wrap(os.put(rec));
  }
  db.close();
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true; // fetch() itself rejected
  return /failed to fetch|networkerror|load failed|network request failed/i.test(err.message || "");
}

// Removes each sale the server accepts (created OR replayed). Stops at
// the first network error (still offline). A server rejection (bad data,
// closed session) stays queued with its attempt count bumped. Returns
// { synced, remaining, stuck }.
export async function flushQueue(storeId, apiFetch) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, remaining: (await listQueuedSales(storeId)).length, stuck: 0 };
  }
  const queued = await listQueuedSales(storeId);
  let synced = 0;
  for (const rec of queued) {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sales`, { method: "POST", body: JSON.stringify(rec.payload) });
      await removeQueued(rec.id);
      synced += 1;
    } catch (err) {
      await bumpAttempt(rec.id, err?.message || "sync failed");
      if (isNetworkError(err)) break;
    }
  }
  const rest = await listQueuedSales(storeId);
  return { synced, remaining: rest.length, stuck: rest.filter((r) => r.attempts >= 3).length };
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
  const rows = term ? all.filter((p) => p.name?.toLowerCase().includes(term) || p.skuLower?.includes(term)) : all;
  rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows.slice(0, limit);
}

export async function findBySku(storeId, sku) {
  const db = await openDb();
  const hit = await wrap(
    db.transaction(CATALOG, "readonly").objectStore(CATALOG).index("storeSku").get([storeId, (sku || "").toLowerCase()]),
  );
  db.close();
  return hit || null;
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
