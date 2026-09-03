import { db } from "./db/index.js";
import { products, productVariants } from "./db/schema.js";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql, count } from "drizzle-orm";
import { stripInternalProductFields } from "./pricing.js";

// What a shopper actually pays - filtering/sorting by price should match
// what's shown and charged, not the pre-discount `price` column. See
// lib/pricing.js's getEffectivePrice for the same math applied in JS.
const EFFECTIVE_PRICE = sql`(${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0))`;

const SORTS = {
  newest: desc(products.createdAt),
  price_asc: asc(EFFECTIVE_PRICE),
  price_desc: desc(EFFECTIVE_PRICE),
};

// Backs both the server-rendered page 1 (app/storefront/[host]/page.js)
// and the "Load more" API it calls for page 2+
// (app/api/v1/storefront/products/route.js) - kept as one shared query so
// the two can never drift out of sync with each other.
export async function getStorefrontProducts({ storeId, page = 1, pageSize = 24, q, categoryId, minPrice, maxPrice, sort = "newest" }) {
  const conditions = [eq(products.storeId, storeId), eq(products.isActive, true), isNull(products.suspendedAt)];
  if (q?.trim()) conditions.push(ilike(products.name, `%${q.trim()}%`));
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(gte(EFFECTIVE_PRICE, minPrice));
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(lte(EFFECTIVE_PRICE, maxPrice));

  const where = and(...conditions);
  const orderBy = SORTS[sort] || SORTS.newest;

  const [items, [{ total }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);

  // A variant-less product is out of stock when its own stock hits 0
  // (null means unlimited, never out of stock). A product sold through
  // variants instead is only out of stock once every one of its active
  // variants is - the product's own `stock` column isn't what's actually
  // sold in that case (see the storefront product page's own stock line).
  const variantRows = items.length > 0
    ? await db
        .select({ productId: productVariants.productId, stock: productVariants.stock })
        .from(productVariants)
        .where(and(inArray(productVariants.productId, items.map((p) => p.id)), eq(productVariants.isActive, true)))
    : [];
  const variantsByProduct = new Map();
  for (const v of variantRows) {
    if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
    variantsByProduct.get(v.productId).push(v);
  }
  const list = items.map((p) => {
    const variants = variantsByProduct.get(p.id);
    const outOfStock = p.productType === "physical" && (variants && variants.length > 0 ? variants.every((v) => v.stock === 0) : p.stock === 0);
    return { ...stripInternalProductFields(p), outOfStock };
  });

  return { list, total };
}
