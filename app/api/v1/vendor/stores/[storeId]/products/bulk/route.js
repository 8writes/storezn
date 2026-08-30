import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { products, categories, stores, branches } from "../../../../../../../../lib/db/schema.js";
import { and, eq, ilike } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, bulkProductRowSchema } from "../../../../../../../../lib/validate.js";
import { slugify } from "../../../../../../../../lib/slugify.js";
import { seedBranchStockForNewItem } from "../../../../../../../../lib/inventory.js";

const MAX_ROWS = 500;

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Bulk product import (e.g. migrating a catalog from a spreadsheet). Rows
// are processed independently - a bad row is reported and skipped rather
// than failing the whole batch, same reasoning as schoolzn's bulk user
// import. No images/variants here (see bulkProductRowSchema) - a vendor
// adds those afterward by editing each product like normal.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Import is limited to ${MAX_ROWS} rows at a time` }, { status: 400 });
  }

  // Every imported product starts stocked at the store's default branch,
  // same as the single-product create route - without a productBranchStock
  // row the checkout stock guard treats it as untracked/unlimited, so a
  // CSV "stock" value would silently never be enforced.
  const [defaultBranch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.storeId, storeId), eq(branches.isDefault, true)))
    .limit(1);

  const categoryCache = new Map();
  const results = [];

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i];
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing

    const result = validate(bulkProductRowSchema, raw);
    if (!result.ok) {
      results.push({ row: rowNumber, name: raw?.name, status: "error", error: result.error });
      continue;
    }
    const data = result.data;

    try {
      let categoryId = null;
      if (data.categoryName) {
        if (!categoryCache.has(data.categoryName)) {
          const [categoryRow] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.storeId, storeId), ilike(categories.name, data.categoryName)))
            .limit(1);
          categoryCache.set(data.categoryName, categoryRow?.id || null);
        }
        categoryId = categoryCache.get(data.categoryName);
        if (!categoryId) {
          results.push({ row: rowNumber, name: data.name, status: "error", error: `Category "${data.categoryName}" not found` });
          continue;
        }
      }

      // Derived from the name, not typed - collides with an existing
      // slug in this store -> "-2", "-3", etc, same pattern as
      // schoolzn's auto subject code.
      const base = slugify(data.name) || "product";
      let slug = base;
      let suffix = 2;
      // eslint-disable-next-line no-await-in-loop
      while (
        await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.storeId, storeId), eq(products.slug, slug)))
          .limit(1)
          .then((r) => r.length > 0)
      ) {
        slug = `${base}-${suffix}`;
        suffix++;
      }

      const created = await db.transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({
            storeId,
            categoryId,
            name: data.name,
            slug,
            sku: data.sku,
            description: data.description,
            price: data.price,
            productType: data.productType,
            condition: data.condition,
            stock: data.stock ?? null,
            isActive: true,
          })
          .returning();
        if (defaultBranch) {
          await seedBranchStockForNewItem(tx, {
            storeId,
            productId: product.id,
            variantId: null,
            initialBranchId: defaultBranch.id,
            initialStock: data.stock ?? null,
          });
        }
        return product;
      });

      results.push({ row: rowNumber, name: data.name, status: "created", productId: created.id });
    } catch (err) {
      results.push({ row: rowNumber, name: data.name, status: "error", error: err.message || "Failed to create this row" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  return NextResponse.json({ results, summary: { total: results.length, created, failed: results.length - created } });
}
