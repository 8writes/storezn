import { db } from "./db/index.js";
import { products, productVariants } from "./db/schema.js";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, notInArray, sql, count } from "drizzle-orm";
import { stripInternalProductFields } from "./pricing.js";

// What a shopper actually pays - filtering/sorting by price should match
// what's shown and charged, not the pre-discount `price` column. See
// lib/pricing.js's getEffectivePrice for the same math applied in JS.
const EFFECTIVE_PRICE = sql`(${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0))`;
const IS_DISCOUNTED = sql`coalesce(${products.discountPercent}, 0) > 0`;
const PRODUCT_CACHE_TTL_MS = 5_000;
const PRODUCT_CACHE_MAX = 2_000;
const storefrontCache = new Map();

function readStorefrontCache(key) {
  const hit = storefrontCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    storefrontCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeStorefrontCache(key, value) {
  storefrontCache.set(key, { value, expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS });
  while (storefrontCache.size > PRODUCT_CACHE_MAX) storefrontCache.delete(storefrontCache.keys().next().value);
  return value;
}

const SORTS = {
  newest: desc(products.createdAt),
  price_asc: asc(EFFECTIVE_PRICE),
  price_desc: desc(EFFECTIVE_PRICE),
};

// Tags each product row with `outOfStock` - a variant-less product is out
// of stock when its own stock hits 0 (null = unlimited); a product sold
// through variants is out only once every active variant is. Shared so
// the grid and the home-page rails compute it the same way.
async function withStock(items) {
  if (items.length === 0) return [];
  const productIds = items.map((p) => p.id);
  const [variantRows, baseStockRows] = await Promise.all([
    db
      .select({ productId: productVariants.productId, stock: productVariants.stock })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true))),
    // Product metadata may come from the short-lived storefront cache, but
    // inventory is always refreshed from the database before it is shown.
    db.select({ id: products.id, stock: products.stock }).from(products).where(inArray(products.id, productIds)),
  ]);
  const baseStockByProduct = new Map(baseStockRows.map((row) => [row.id, row.stock]));
  const variantsByProduct = new Map();
  for (const v of variantRows) {
    if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
    variantsByProduct.get(v.productId).push(v);
  }
  return items.map((p) => {
    const variants = variantsByProduct.get(p.id);
    const stock = baseStockByProduct.has(p.id) ? baseStockByProduct.get(p.id) : p.stock;
    const outOfStock =
      p.productType === "physical" && (variants && variants.length > 0 ? variants.every((v) => v.stock == null || v.stock <= 0) : stock != null && stock <= 0);
    return { ...stripInternalProductFields({ ...p, stock }), outOfStock };
  });
}

// Backs both the server-rendered page 1 (app/storefront/[host]/page.js)
// and the "Load more" API it calls for page 2+
// (app/api/v1/storefront/products/route.js) - kept as one shared query so
// the two can never drift out of sync with each other.
export async function getStorefrontProducts({ storeId, page = 1, pageSize = 24, q, categoryId, minPrice, maxPrice, sort = "newest", discountedOnly = false }) {
  page = Math.min(1_000, Math.max(1, Number(page) || 1));
  pageSize = Math.min(48, Math.max(1, Number(pageSize) || 24));
  const cacheKey = JSON.stringify({ storeId, page, pageSize, q: q?.trim() || "", categoryId: categoryId || "", minPrice, maxPrice, sort, discountedOnly });
  const cached = readStorefrontCache(`products:${cacheKey}`);
  if (cached) return { list: await withStock(cached.items), total: cached.total };
  const conditions = [eq(products.storeId, storeId), eq(products.isActive, true), isNull(products.suspendedAt)];
  if (q?.trim()) conditions.push(ilike(products.name, `%${q.trim()}%`));
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(gte(EFFECTIVE_PRICE, minPrice));
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(lte(EFFECTIVE_PRICE, maxPrice));
  if (discountedOnly) conditions.push(IS_DISCOUNTED);

  const where = and(...conditions);
  const orderBy = SORTS[sort] || SORTS.newest;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);

  const list = await withStock(items);
  writeStorefrontCache(`products:${cacheKey}`, { items, total });
  return { list, total };
}

// The two horizontal rails on the storefront home page. `featured` is the
// vendor's own curated pick (products.featuredOrder, capped at 10 by the
// vendor featured route); `discounted` is auto-filled from whatever's on
// sale, biggest discount first. Both are only shown when no search/filter
// is active (see app/storefront/[host]/page.js).
export async function getStorefrontRails({ storeId, limit = 10 }) {
  limit = Math.min(20, Math.max(1, Number(limit) || 10));
  const cacheKey = `rails:${storeId}:${limit}`;
  const cached = readStorefrontCache(cacheKey);
  if (cached) {
    const [featured, discounted] = await Promise.all([withStock(cached.featuredItems), withStock(cached.discountedItems)]);
    return { featured, discounted };
  }
  const base = and(eq(products.storeId, storeId), eq(products.isActive, true), isNull(products.suspendedAt));

  const [featuredItems, discountedItems] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(base, sql`${products.featuredOrder} is not null`))
      .orderBy(asc(products.featuredOrder), desc(products.createdAt))
      .limit(limit),
    db
      .select()
      .from(products)
      .where(and(base, IS_DISCOUNTED))
      .orderBy(desc(products.discountPercent), desc(products.createdAt))
      .limit(limit),
  ]);

  const [featured, discounted] = await Promise.all([withStock(featuredItems), withStock(discountedItems)]);
  writeStorefrontCache(cacheKey, { featuredItems, discountedItems });
  return { featured, discounted };
}

// Related products stay inside the current store. Prefer the same category,
// then fill remaining slots with the same product type so a small category
// still gets a useful rail. Raw product rows are cached briefly, while
// withStock refreshes inventory before returning anything to the shopper.
export async function getSimilarStorefrontProducts({ storeId, productId, categoryId, productType, limit = 10 }) {
  limit = Math.min(10, Math.max(1, Number(limit) || 10));
  const cacheKey = `similar:${storeId}:${productId}:${categoryId || "none"}:${productType || "none"}:${limit}`;
  const cached = readStorefrontCache(cacheKey);
  if (cached) return withStock(cached);

  const base = [eq(products.storeId, storeId), eq(products.isActive, true), isNull(products.suspendedAt), ne(products.id, productId)];
  let items = [];
  if (categoryId) {
    items = await db
      .select()
      .from(products)
      .where(and(...base, eq(products.categoryId, categoryId)))
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  if (items.length < limit) {
    const seenIds = [productId, ...items.map((item) => item.id)];
    const fallback = await db
      .select()
      .from(products)
      .where(and(...base, eq(products.productType, productType), notInArray(products.id, seenIds)))
      .orderBy(desc(products.createdAt))
      .limit(limit - items.length);
    items = [...items, ...fallback];
  }

  writeStorefrontCache(cacheKey, items);
  return withStock(items);
}
