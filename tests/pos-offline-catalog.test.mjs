import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

import {
  catalogMeta,
  clearCatalog,
  findBySku,
  saveCatalog,
  searchCatalogPage,
} from "../lib/posOffline.js";

const STORE_ID = "offline-search-store";
const BRANCH_ID = "offline-search-branch";

function deleteTestDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("storezn-pos");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked"));
  });
}

test("offline catalogue searches every product and paginates without gaps", async () => {
  await deleteTestDatabase();
  const createdAt = "2026-09-24T12:00:00.000Z";
  const products = Array.from({ length: 53 }, (_, index) => ({
    id: `product-${String(index + 1).padStart(3, "0")}`,
    name: index === 47 ? "Now Woman Body Spray 200ml" : `Catalogue product ${index + 1}`,
    sku: index === 47 ? "NOW-WOMAN-200" : `SKU-${index + 1}`,
    createdAt,
    offlineVariants: index === 47
      ? [{ id: "variant-048", productId: "product-048", sku: "8901234567890", options: { size: "200ml" }, stock: 4 }]
      : [],
  }));

  await saveCatalog(STORE_ID, products, BRANCH_ID);

  const seen = [];
  for (let page = 1; page <= 3; page += 1) {
    const result = await searchCatalogPage(STORE_ID, "", { page, pageSize: 20, branchId: BRANCH_ID });
    assert.equal(result.total, 53);
    seen.push(...result.products.map((product) => product.id));
  }
  assert.equal(seen.length, 53);
  assert.equal(new Set(seen).size, 53);

  const byName = await searchCatalogPage(STORE_ID, "now woman body spray", { branchId: BRANCH_ID });
  assert.deepEqual(byName.products.map((product) => product.id), ["product-048"]);

  const bySku = await searchCatalogPage(STORE_ID, "now-woman-200", { branchId: BRANCH_ID });
  assert.deepEqual(bySku.products.map((product) => product.id), ["product-048"]);

  const byVariantBarcode = await findBySku(STORE_ID, "8901234567890", BRANCH_ID);
  assert.equal(byVariantBarcode?.id, "product-048");
  assert.equal(byVariantBarcode?._matchedVariant?.id, "variant-048");

  const meta = await catalogMeta(STORE_ID, BRANCH_ID);
  assert.equal(meta?.complete, true);
  assert.equal(meta?.actualCount, 53);
});

test("offline setup reset removes old products before saving the replacement", async () => {
  await clearCatalog(STORE_ID);
  const empty = await searchCatalogPage(STORE_ID, "Now Woman", { branchId: BRANCH_ID });
  assert.equal(empty.total, 0);
  assert.equal(await catalogMeta(STORE_ID, BRANCH_ID), null);

  await saveCatalog(STORE_ID, [{
    id: "replacement-product",
    name: "Replacement product",
    sku: "REPLACEMENT-1",
    createdAt: "2026-09-24T13:00:00.000Z",
    offlineVariants: [],
  }], BRANCH_ID);

  const oldSearch = await searchCatalogPage(STORE_ID, "Now Woman", { branchId: BRANCH_ID });
  const newSearch = await searchCatalogPage(STORE_ID, "Replacement", { branchId: BRANCH_ID });
  assert.equal(oldSearch.total, 0);
  assert.deepEqual(newSearch.products.map((product) => product.id), ["replacement-product"]);
});
