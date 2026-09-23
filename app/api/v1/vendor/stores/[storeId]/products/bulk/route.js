import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { products, productVariants, productBranchStock, categories, stores, branches } from "../../../../../../../../lib/db/schema.js";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getUser, canManageStore, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { validate, bulkProductRowSchema } from "../../../../../../../../lib/validate.js";
import { parsePagination } from "../../../../../../../../lib/pagination.js";
import { slugify } from "../../../../../../../../lib/slugify.js";
import { LOW_STOCK_THRESHOLD, seedBranchStockForNewItem } from "../../../../../../../../lib/inventory.js";
import { getProductLimit } from "../../../../../../../../lib/storePlan.js";
import { STAFF_BRANCH_REQUIRED_MESSAGE, stockBranchForUser } from "../../../../../../../../lib/stockBranch.js";
import {
  isProductNameUniqueViolation,
  normalizeProductName,
  productNameKey,
  productNameKeyExpression,
  PRODUCT_NAME_TAKEN_MESSAGE,
} from "../../../../../../../../lib/productName.js";

const MAX_ROWS = 500;

function isSkuUniqueViolation(error) {
  return error?.code === "23505" && error?.constraint_name === "uq_products_store_sku";
}

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// One page (20 by default) of base products for the bulk-edit grid, plus
// the branch's stock for just those rows. ?q= narrows by name / SKU (used
// by the grid's search and its "scan to find"); ?page= walks the rest
// ("load more"). branches + categories only ride along on page 1.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(sp);
  const q = sp.get("q")?.trim();

  const branchRows = await db
    .select({ id: branches.id, name: branches.name, isDefault: branches.isDefault })
    .from(branches)
    .where(eq(branches.storeId, storeId))
    .orderBy(branches.createdAt);

  const requested = sp.get("branchId")?.trim() || null;
  let target;
  if (user.role === "staff") target = stockBranchForUser(branchRows, user);
  else if (requested) target = branchRows.find((b) => b.id === requested);
  else target = branchRows.find((b) => b.isDefault) || branchRows[0];
  if (user.role === "staff" && !target) return NextResponse.json({ error: STAFF_BRANCH_REQUIRED_MESSAGE }, { status: 409 });
  if (!target) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const where = [eq(products.storeId, storeId)];
  if (q) where.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`)));
  const categoryId = sp.get("category")?.trim();
  if (categoryId) where.push(eq(products.categoryId, categoryId));

  const stockValue = productBranchStock.stock;
  const stockFilter = sp.get("stock")?.trim();
  if (stockFilter === "in") where.push(or(isNull(stockValue), gt(stockValue, LOW_STOCK_THRESHOLD)));
  else if (stockFilter === "low") where.push(and(gt(stockValue, 0), lte(stockValue, LOW_STOCK_THRESHOLD)));
  else if (stockFilter === "out") where.push(eq(stockValue, 0));
  else if (stockFilter === "oversold") where.push(lt(stockValue, 0));

  const statusFilter = sp.get("status")?.trim();
  if (statusFilter === "active") where.push(eq(products.isActive, true));
  else if (statusFilter === "archived") where.push(eq(products.isActive, false));

  const featuredFilter = sp.get("featured")?.trim();
  if (featuredFilter === "yes") where.push(isNotNull(products.featuredOrder));
  else if (featuredFilter === "no") where.push(isNull(products.featuredOrder));

  const expiryFilter = sp.get("expiry")?.trim();
  if (expiryFilter === "soon") where.push(sql`${products.expiryDate} is not null and ${products.expiryDate} >= current_date and ${products.expiryDate} < current_date + 30`);
  else if (expiryFilter === "expired") where.push(sql`${products.expiryDate} is not null and ${products.expiryDate} < current_date`);

  const sorts = {
    newest: desc(products.createdAt),
    oldest: asc(products.createdAt),
    name: asc(products.name),
    price_high: desc(products.price),
    price_low: asc(products.price),
  };
  const orderBy = sorts[sp.get("sort")] || sorts.newest;

  const variantCountSql = sql`(select count(*)::int from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.isActive})`;
  const [rows, [{ total }], cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        price: products.price,
        costPrice: products.costPrice,
        categoryId: products.categoryId,
        categoryName: categories.name,
        expiryDate: products.expiryDate,
        productType: products.productType,
        stock: products.stock,
        variantCount: variantCountSql,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(productBranchStock, and(
        eq(productBranchStock.productId, products.id),
        eq(productBranchStock.branchId, target.id),
        isNull(productBranchStock.variantId),
      ))
      .where(and(...where))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products)
      .leftJoin(productBranchStock, and(
        eq(productBranchStock.productId, products.id),
        eq(productBranchStock.branchId, target.id),
        isNull(productBranchStock.variantId),
      ))
      .where(and(...where)),
    page === 1
      ? db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.storeId, storeId)).orderBy(categories.name)
      : Promise.resolve(null),
  ]);

  const ids = rows.map((r) => r.id);
  const stockRows = ids.length
    ? await db
        .select({ productId: productBranchStock.productId, stock: productBranchStock.stock })
        .from(productBranchStock)
        .where(and(inArray(productBranchStock.productId, ids), eq(productBranchStock.branchId, target.id), isNull(productBranchStock.variantId)))
    : [];
  const stock = {};
  for (const r of stockRows) stock[r.productId] = r.stock;

  return NextResponse.json({
    branchId: target.id,
    branchName: target.name,
    branches: page === 1 ? (isStoreOwner(user, store) ? branchRows.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault })) : undefined) : undefined,
    categories: cats || undefined,
    stock,
    products: rows.map((r) => ({ ...r, hasVariants: Number(r.variantCount) > 0, variantCount: undefined })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
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

  const productLimit = getProductLimit(store);
  if (Number.isFinite(productLimit)) {
    const [{ total: productCount }] = await db.select({ total: count() }).from(products).where(eq(products.storeId, storeId));
    const remaining = Math.max(0, productLimit - productCount);
    if (body.rows.length > remaining) {
      return NextResponse.json(
        {
          error:
            remaining > 0
              ? `Free stores can add ${remaining} more product${remaining === 1 ? "" : "s"} before reaching the ${productLimit}-product limit.`
              : `Free stores can list up to ${productLimit} products. Upgrade to Storezn+ to add more.`,
        },
        { status: 402 },
      );
    }
  }

  // Every imported product starts stocked at the staff member's assigned
  // branch (or the default branch for an owner) - without a productBranchStock
  // row the checkout stock guard treats it as untracked/unlimited, so a
  // CSV "stock" value would silently never be enforced.
  const storeBranches = await db
    .select({ id: branches.id, isDefault: branches.isDefault })
    .from(branches)
    .where(eq(branches.storeId, storeId));
  const initialBranch = stockBranchForUser(storeBranches, user);
  if (user.role === "staff" && !initialBranch) {
    return NextResponse.json({ error: STAFF_BRANCH_REQUIRED_MESSAGE }, { status: 409 });
  }

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
    data.name = normalizeProductName(data.name);

    try {
      const [sameName] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.storeId, storeId), sql`${productNameKeyExpression(products.name)} = ${productNameKey(data.name)}`))
        .limit(1);
      if (sameName) {
        results.push({ row: rowNumber, name: data.name, status: "error", error: PRODUCT_NAME_TAKEN_MESSAGE });
        continue;
      }

      let categoryId = null;
      if (data.categoryId) {
        // Grid path: an id picked from the store's own category list.
        if (!categoryCache.has(`id:${data.categoryId}`)) {
          const [row] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.storeId, storeId), eq(categories.id, data.categoryId)))
            .limit(1);
          categoryCache.set(`id:${data.categoryId}`, row?.id || null);
        }
        categoryId = categoryCache.get(`id:${data.categoryId}`);
        if (!categoryId) {
          results.push({ row: rowNumber, name: data.name, status: "error", error: "That category doesn't belong to this store" });
          continue;
        }
      } else if (data.categoryName) {
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
            costPrice: data.costPrice ?? null,
            productType: data.productType,
            condition: data.condition,
            stock: data.stock ?? null,
            expiryDate: data.expiryDate || null,
            isActive: true,
          })
          .returning();
        if (initialBranch) {
          await seedBranchStockForNewItem(tx, {
            storeId,
            productId: product.id,
            variantId: null,
            initialBranchId: initialBranch.id,
            initialStock: data.stock ?? null,
          });
        }
        return product;
      });

      results.push({ row: rowNumber, name: data.name, status: "created", productId: created.id });
    } catch (err) {
      results.push({
        row: rowNumber,
        name: data.name,
        status: "error",
        error: isProductNameUniqueViolation(err)
          ? PRODUCT_NAME_TAKEN_MESSAGE
          : isSkuUniqueViolation(err)
            ? "A product with that SKU already exists in this store"
            : err.message || "Failed to create this row",
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  return NextResponse.json({ results, summary: { total: results.length, created, failed: results.length - created } });
}
