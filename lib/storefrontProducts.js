import { db } from "./db/index.js";
import { products, productVariants } from "./db/schema.js";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql, count } from "drizzle-orm";
import { stripInternalProductFields } from "./pricing.js";

// What a shopper actually pays - filtering/sorting by price should match
// what's shown and charged, not the pre-discount `price` column. See
// lib/pricing.js's getEffectivePrice for the same math applied in JS.
const EFFECTIVE_PRICE = sql`(${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0))`;
const IS_DISCOUNTED = sql`coalesce(${products.discountPercent}, 0) > 0`;

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
  const variantRows = await db
    .select({ productId: productVariants.productId, stock: productVariants.stock })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, items.map((p) => p.id)), eq(productVariants.isActive, true)));
  const variantsByProduct = new Map();
  for (const v of variantRows) {
    if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
    variantsByProduct.get(v.productId).push(v);
  }
  return items.map((p) => {
    const variants = variantsByProduct.get(p.id);
    const outOfStock =
      p.productType === "physical" && (variants && variants.length > 0 ? variants.every((v) => v.stock === 0) : p.stock === 0);
    return { ...stripInternalProductFields(p), outOfStock };
  });
}

// Backs both the server-rendered page 1 (app/storefront/[host]/page.js)
// and the "Load more" API it calls for page 2+
// (app/api/v1/storefront/products/route.js) - kept as one shared query so
// the two can never drift out of sync with each other.
export async function getStorefrontProducts({ storeId, page = 1, pageSize = 24, q, categoryId, minPrice, maxPrice, sort = "newest", discountedOnly = false }) {
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

  return { list: await withStock(items), total };
}

// The two horizontal rails on the storefront home page. `featured` is the
// vendor's own curated pick (products.featuredOrder, capped at 10 by the
// vendor featured route); `discounted` is auto-filled from whatever's on
// sale, biggest discount first. Both are only shown when no search/filter
// is active (see app/storefront/[host]/page.js).
export async function getStorefrontRails({ storeId, limit = 10 }) {
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
  return { featured, discounted };
}
