import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { products, stores, branches, categories } from "../../../../../../../lib/db/schema.js";
import { and, asc, count, desc, eq, gt, ilike, isNull, lte, or } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createProductSchema } from "../../../../../../../lib/validate.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";
import { seedBranchStockForNewItem, LOW_STOCK_THRESHOLD } from "../../../../../../../lib/inventory.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Vendor list ordering - defaults to newest-added first.
const SORTS = {
  newest: desc(products.createdAt),
  oldest: asc(products.createdAt),
  name: asc(products.name),
  price_high: desc(products.price),
  price_low: asc(products.price),
};

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const categoryId = searchParams.get("category")?.trim();
  const orderBy = SORTS[searchParams.get("sort")] || SORTS.newest;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const conditions = [eq(products.storeId, storeId)];
  if (q) conditions.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`)));
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  // Stock-level filter. products.stock is the cached storewide sum (see
  // lib/inventory.js) - null means untracked/unlimited, which counts as
  // "in stock", never low or out.
  const stockFilter = searchParams.get("stock")?.trim();
  if (stockFilter === "in") {
    conditions.push(or(isNull(products.stock), gt(products.stock, LOW_STOCK_THRESHOLD)));
  } else if (stockFilter === "low") {
    conditions.push(and(gt(products.stock, 0), lte(products.stock, LOW_STOCK_THRESHOLD)));
  } else if (stockFilter === "out") {
    conditions.push(lte(products.stock, 0));
  }

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ product: products, categoryName: categories.name })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products).where(and(...conditions)),
  ]);

  return NextResponse.json({
    products: rows.map((r) => ({ ...r.product, categoryName: r.categoryName })),
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createProductSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.slug, result.data.slug)))
    .limit(1);
  if (existing) return NextResponse.json({ error: "That product slug already exists" }, { status: 409 });

  const created = await db.transaction(async (tx) => {
    const [product] = await tx.insert(products).values({ storeId, ...result.data }).returning();
    // A new product only ever starts stocked at the store's default
    // branch - a vendor allocates it to other branches afterward from
    // the product edit page (see seedBranchStockForNewItem's own
    // comment in lib/inventory.js for why every other branch still
    // needs an explicit 0 row, not just no row at all).
    const [defaultBranch] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.storeId, storeId), eq(branches.isDefault, true))).limit(1);
    if (defaultBranch) {
      await seedBranchStockForNewItem(tx, { storeId, productId: product.id, variantId: null, initialBranchId: defaultBranch.id, initialStock: result.data.stock ?? null });
    }
    return product;
  });
  return NextResponse.json({ product: created }, { status: 201 });
}
