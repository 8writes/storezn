import { db } from "./db/index.js";
import { products, stores, users, categories } from "./db/schema.js";
import { and, asc, desc, eq, gte, ilike, isNull, lte, sql, count } from "drizzle-orm";

// Same effective-price math as the per-store storefront (see
// app/storefront/[host]/page.js) - filtering/sorting by price should
// match what's shown and charged, not the pre-discount `price` column.
const EFFECTIVE_PRICE = sql`(${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0))`;

const SORTS = {
  newest: desc(products.createdAt),
  price_asc: asc(EFFECTIVE_PRICE),
  price_desc: desc(EFFECTIVE_PRICE),
};

// Cross-store product feed for the public marketplace (app/marketplace/page.js)
// - a product only shows up here once its store has opted in
// (stores.listOnMarketplace) AND is actually live, same definition as
// isStoreLive in lib/resolveStore.js but applied as a join since this
// spans every store at once rather than resolving one by host. The
// product's own isActive/suspendedAt checks are the same ones a single
// store's storefront already applies.
export async function getMarketplaceProducts({ page = 1, pageSize = 24, q, categoryName, minPrice, maxPrice, sort = "newest" } = {}) {
  const conditions = [
    eq(stores.listOnMarketplace, true),
    eq(stores.isActive, true),
    eq(stores.isOpen, true),
    eq(users.approvalStatus, "approved"),
    eq(products.isActive, true),
    isNull(products.suspendedAt),
  ];
  if (q?.trim()) conditions.push(ilike(products.name, `%${q.trim()}%`));
  // Categories are per-store (categories.storeId) - there's no
  // marketplace-wide category table, so "Electronics" across two
  // different stores is matched by name, not by a shared categoryId.
  if (categoryName?.trim()) conditions.push(eq(categories.name, categoryName.trim()));
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(gte(EFFECTIVE_PRICE, minPrice));
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(lte(EFFECTIVE_PRICE, maxPrice));

  const where = and(...conditions);
  const orderBy = SORTS[sort] || SORTS.newest;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        product: products,
        store: { id: stores.id, name: stores.name, slug: stores.slug, customDomain: stores.customDomain, state: stores.state },
      })
      .from(products)
      .innerJoin(stores, eq(products.storeId, stores.id))
      .innerJoin(users, eq(stores.ownerId, users.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(products)
      .innerJoin(stores, eq(products.storeId, stores.id))
      .innerJoin(users, eq(stores.ownerId, users.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where),
  ]);

  return { list: rows.map((r) => ({ ...r.product, store: r.store })), total };
}

// Distinct category names available across every marketplace-eligible
// store, for the "All categories" filter (app/marketplace/page.js) - dedup'd
// by name since categories are per-store rows with their own ids, and
// two stores calling something "Electronics" should filter as one
// option, not two. Only names that actually have at least one live,
// marketplace-eligible product attached show up, so the filter never
// offers a category that would just return zero results.
export async function getMarketplaceCategoryNames() {
  const rows = await db
    .selectDistinct({ name: categories.name })
    .from(products)
    .innerJoin(stores, eq(products.storeId, stores.id))
    .innerJoin(users, eq(stores.ownerId, users.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(stores.listOnMarketplace, true),
        eq(stores.isActive, true),
        eq(stores.isOpen, true),
        eq(users.approvalStatus, "approved"),
        eq(products.isActive, true),
        isNull(products.suspendedAt),
      ),
    )
    .orderBy(categories.name);
  return rows.map((r) => r.name);
}
