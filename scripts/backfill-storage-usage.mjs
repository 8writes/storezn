// One-time backfill for stores.storeUploads - vendors who uploaded
// files (logo, favicon, product photos) before the storage-metering
// ledger existed (see lib/storeUploads.js) have no rows there, so their
// usage reads as 0 even though real files exist in storage. This scans
// every store's logoUrl/faviconUrl and every product's images array,
// HEAD-requests each URL for its real Content-Length, and inserts a
// storeUploads row for it - skipping any URL already recorded, so this
// is safe to re-run.
//
// Run: node --env-file=.env scripts/backfill-storage-usage.mjs
import { db } from "../lib/db/index.js";
import { stores, products, storeUploads } from "../lib/db/schema.js";
import { eq, inArray } from "drizzle-orm";

const CONCURRENCY = 8;

async function getSizeBytes(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

async function runBatched(items, worker, concurrency) {
  const results = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

const allStores = await db.select({ id: stores.id, logoUrl: stores.logoUrl, faviconUrl: stores.faviconUrl }).from(stores);
const allProducts = await db.select({ storeId: products.storeId, images: products.images }).from(products);

const candidates = [];
for (const store of allStores) {
  if (store.logoUrl) candidates.push({ storeId: store.id, url: store.logoUrl, purpose: "store-logo" });
  if (store.faviconUrl) candidates.push({ storeId: store.id, url: store.faviconUrl, purpose: "store-favicon" });
}
for (const product of allProducts) {
  for (const url of product.images || []) {
    candidates.push({ storeId: product.storeId, url, purpose: "product-image" });
  }
}

console.log(`Found ${candidates.length} files across ${allStores.length} stores to check.`);

const urls = [...new Set(candidates.map((c) => c.url))];
const existing = urls.length > 0 ? await db.select({ url: storeUploads.url }).from(storeUploads).where(inArray(storeUploads.url, urls)) : [];
const alreadyTracked = new Set(existing.map((e) => e.url));

const toInsert = candidates.filter((c) => !alreadyTracked.has(c.url));
console.log(`${candidates.length - toInsert.length} already tracked, checking ${toInsert.length} new ones...`);

let inserted = 0;
let failed = 0;

await runBatched(
  toInsert,
  async (c) => {
    const sizeBytes = await getSizeBytes(c.url);
    if (sizeBytes == null) {
      failed++;
      console.warn(`Could not size: ${c.url}`);
      return;
    }
    await db.insert(storeUploads).values({ storeId: c.storeId, url: c.url, sizeBytes, purpose: c.purpose });
    inserted++;
  },
  CONCURRENCY,
);

console.log(`Done. Inserted ${inserted}, failed to size ${failed}.`);
process.exit(0);
