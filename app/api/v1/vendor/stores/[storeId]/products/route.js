import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { products, productVariants, productBranchStock, stores, branches, categories } from "../../../../../../../lib/db/schema.js";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createProductSchema } from "../../../../../../../lib/validate.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";
import { seedBranchStockForNewItem, LOW_STOCK_THRESHOLD } from "../../../../../../../lib/inventory.js";
import { logStoreActivity } from "../../../../../../../lib/storeActivity.js";
import { getProductLimit } from "../../../../../../../lib/storePlan.js";
import { STAFF_BRANCH_REQUIRED_MESSAGE, stockBranchForUser } from "../../../../../../../lib/stockBranch.js";
import {
  isProductNameUniqueViolation,
  normalizeProductName,
  productNameKey,
  productNameKeyExpression,
  PRODUCT_NAME_TAKEN_MESSAGE,
} from "../../../../../../../lib/productName.js";
import { barcodeCandidates } from "../../../../../../../lib/barcode.js";

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
  const storeBranches = await db.select({ id: branches.id, name: branches.name, isDefault: branches.isDefault })
    .from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  const allowedBranches = user.role === "staff" && user.branchId
    ? storeBranches.filter((branch) => branch.id === user.branchId)
    : storeBranches;
  const requestedBranchId = searchParams.get("branch")?.trim();
  const selectedBranch = user.role === "staff" && user.branchId
    ? allowedBranches[0] || null
    : allowedBranches.find((branch) => branch.id === requestedBranchId) || null;
  const q = searchParams.get("q")?.trim();
  const exactSku = searchParams.get("sku")?.trim();
  const categoryId = searchParams.get("category")?.trim();
  const orderBy = SORTS[searchParams.get("sort")] || SORTS.newest;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const includeVariants = searchParams.get("includeVariants") === "true";
  const conditions = [eq(products.storeId, storeId)];
  if (q) {
    const searchTerm = `%${q}%`;
    conditions.push(
      or(
        ilike(products.name, searchTerm),
        ilike(products.sku, searchTerm),
        // A barcode often belongs to a sellable variant rather than its
        // parent product. Return that parent so the POS can select the
        // exact variant instead of treating the barcode as unknown.
        sql`exists (
          select 1 from ${productVariants}
          where ${productVariants.productId} = ${products.id}
            and ${productVariants.isActive}
            and ${productVariants.sku} ilike ${searchTerm}
        )`,
      ),
    );
  }
  if (exactSku) {
    const candidates = barcodeCandidates(exactSku);
    if (candidates.length === 0) {
      conditions.push(sql`false`);
    } else {
      conditions.push(or(...candidates.map((candidate) => or(
        sql`lower(btrim(${products.sku})) = ${candidate}`,
        sql`exists (
          select 1 from ${productVariants}
          where ${productVariants.productId} = ${products.id}
            and ${productVariants.isActive}
            and lower(btrim(${productVariants.sku})) = ${candidate}
        )`,
      ))));
    }
  }
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  // A selected branch makes that branch's base-product stock authoritative
  // for filtering and display. Without a branch, use the cached store total.
  const stockValue = selectedBranch ? productBranchStock.stock : products.stock;
  const stockFilter = searchParams.get("stock")?.trim();
  if (stockFilter === "in") {
    conditions.push(or(isNull(stockValue), gt(stockValue, LOW_STOCK_THRESHOLD)));
  } else if (stockFilter === "low") {
    conditions.push(and(gt(stockValue, 0), lte(stockValue, LOW_STOCK_THRESHOLD)));
  } else if (stockFilter === "out") {
    conditions.push(eq(stockValue, 0));
  } else if (stockFilter === "oversold") {
    conditions.push(lt(stockValue, 0));
  }

  // Status filter - the vendor's own Live/Archived toggle (products.isActive),
  // not the admin suspension. "" / anything else = both.
  const statusFilter = searchParams.get("status")?.trim();
  if (statusFilter === "active") conditions.push(eq(products.isActive, true));
  else if (statusFilter === "archived") conditions.push(eq(products.isActive, false));
  if (searchParams.get("sellable") === "true") conditions.push(isNull(products.suspendedAt));

  // Featured filter - on/off the storefront's Featured rail
  // (products.featuredOrder is null vs set).
  const featuredFilter = searchParams.get("featured")?.trim();
  if (featuredFilter === "yes") conditions.push(isNotNull(products.featuredOrder));
  else if (featuredFilter === "no") conditions.push(isNull(products.featuredOrder));

  // Expiry filter. "soon" = a use-by date within the next 30 days (and
  // not already past); "expired" = a use-by date that's passed.
  const expiryFilter = searchParams.get("expiry")?.trim();
  if (expiryFilter === "soon") {
    conditions.push(sql`${products.expiryDate} is not null and ${products.expiryDate} >= current_date and ${products.expiryDate} < current_date + 30`);
  } else if (expiryFilter === "expired") {
    conditions.push(sql`${products.expiryDate} is not null and ${products.expiryDate} < current_date`);
  }

  // Active-variant count per product, so the POS can skip a per-item
  // "does this have options?" round trip when adding to the sale.
  const variantCountSql = sql`(
    select count(*)::int from ${productVariants}
    where ${productVariants.productId} = ${products.id} and ${productVariants.isActive}
  )`;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ product: products, branchStock: selectedBranch ? productBranchStock.stock : products.stock, categoryName: categories.name, variantCount: variantCountSql })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(productBranchStock, and(
        eq(productBranchStock.productId, products.id),
        selectedBranch ? eq(productBranchStock.branchId, selectedBranch.id) : sql`false`,
        isNull(productBranchStock.variantId),
      ))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(products)
      .leftJoin(productBranchStock, and(
        eq(productBranchStock.productId, products.id),
        selectedBranch ? eq(productBranchStock.branchId, selectedBranch.id) : sql`false`,
        isNull(productBranchStock.variantId),
      ))
      .where(and(...conditions)),
  ]);

  // Offline POS catalogue sync asks for variants alongside each product.
  // One batched query per page avoids an N+1 request storm for large stores.
  const variantRows = includeVariants && rows.length
    ? await db
      .select({ variant: productVariants, branchStock: selectedBranch ? productBranchStock.stock : productVariants.stock })
      .from(productVariants)
      .leftJoin(productBranchStock, and(
        eq(productBranchStock.productId, productVariants.productId),
        eq(productBranchStock.variantId, productVariants.id),
        selectedBranch ? eq(productBranchStock.branchId, selectedBranch.id) : sql`false`,
      ))
      .where(and(
        inArray(productVariants.productId, rows.map((row) => row.product.id)),
        eq(productVariants.isActive, true),
      ))
      .orderBy(productVariants.createdAt)
    : [];
  const variantsByProduct = new Map();
  for (const row of variantRows) {
    const variant = { ...row.variant, stock: row.branchStock };
    const list = variantsByProduct.get(variant.productId) || [];
    list.push(variant);
    variantsByProduct.set(variant.productId, list);
  }

  return NextResponse.json({
    products: rows.map((r) => ({
      ...r.product,
      stock: r.branchStock,
      categoryName: r.categoryName,
      variantCount: Number(r.variantCount) || 0,
      ...(includeVariants ? { offlineVariants: variantsByProduct.get(r.product.id) || [] } : {}),
    })),
    branches: allowedBranches,
    selectedBranch: selectedBranch ? { id: selectedBranch.id, name: selectedBranch.name } : null,
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

  const productLimit = getProductLimit(store);
  if (Number.isFinite(productLimit)) {
    const [{ total: productCount }] = await db.select({ total: count() }).from(products).where(eq(products.storeId, storeId));
    if (productCount >= productLimit) {
      return NextResponse.json(
        { error: `Free stores can list up to ${productLimit} products. Upgrade to Storezn+ to add more.` },
        { status: 402 },
      );
    }
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createProductSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const normalizedName = normalizeProductName(result.data.name);
  const [[existingName], [existingSlug]] = await Promise.all([
    db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), sql`${productNameKeyExpression(products.name)} = ${productNameKey(normalizedName)}`))
      .limit(1),
    db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.slug, result.data.slug)))
      .limit(1),
  ]);
  if (existingName) return NextResponse.json({ error: PRODUCT_NAME_TAKEN_MESSAGE }, { status: 409 });
  if (existingSlug) return NextResponse.json({ error: "That product slug already exists" }, { status: 409 });

  const { branchStock, variants: requestedVariants, ...productData } = result.data;
  productData.name = normalizedName;
  // The `date` column rejects "" - the form sends "" to mean "no date".
  if (productData.expiryDate === "") productData.expiryDate = null;

  const variants = Array.isArray(requestedVariants) ? requestedVariants : [];
  const variantKeys = new Set();
  for (const variant of variants) {
    const key = Object.entries(variant.options).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("|");
    if (variantKeys.has(key)) return NextResponse.json({ error: "Duplicate variant options are not allowed" }, { status: 409 });
    variantKeys.add(key);
    if (productData.saleMode === "invoice_required" && variant.price != null) {
      return NextResponse.json({ error: "Invoice-required variants cannot have a fixed price" }, { status: 400 });
    }
  }

  const storeBranches = await db
    .select({ id: branches.id, isDefault: branches.isDefault })
    .from(branches)
    .where(eq(branches.storeId, storeId));
  const initialBranch = stockBranchForUser(storeBranches, user);
  if (user.role === "staff" && !initialBranch) {
    return NextResponse.json({ error: STAFF_BRANCH_REQUIRED_MESSAGE }, { status: 409 });
  }

  let created;
  try {
    created = await db.transaction(async (tx) => {
      const [product] = await tx.insert(products).values({ storeId, ...productData }).returning();

    const defaultBranch = storeBranches.find((b) => b.isDefault);

    // Multi-branch store + a per-branch allocation from the create form -
    // seed exactly those numbers (any branch omitted gets 0). Otherwise a
    // new product just starts stocked at the default branch; other
    // branches still get an explicit 0 row (see seedBranchStockForNewItem).
    let stockByBranch;
    if (Array.isArray(branchStock) && branchStock.length && storeBranches.length > 1) {
      const valid = new Set(storeBranches.map((b) => b.id));
      stockByBranch = {};
      for (const bs of branchStock) if (valid.has(bs.branchId)) stockByBranch[bs.branchId] = bs.stock;
    }

    // A branch-scoped staff member only stocks their own branch - fold
    // any plain `stock` they sent into that branch and drop every other
    // branch id, so they can never seed stock into a branch they don't
    // run (mirrors the branch-stock PATCH route's staff guard).
    if (user.role === "staff" && initialBranch) {
      const own = stockByBranch?.[initialBranch.id] ?? productData.stock ?? 0;
      stockByBranch = { [initialBranch.id]: own };
    }

      if (defaultBranch || stockByBranch) {
        await seedBranchStockForNewItem(tx, {
        storeId,
        productId: product.id,
        variantId: null,
        initialBranchId: defaultBranch?.id ?? null,
        initialStock: productData.stock ?? null,
          stockByBranch,
        });
      }
      for (const variant of variants) {
        const [createdVariant] = await tx.insert(productVariants).values({
          productId: product.id,
          options: variant.options,
          sku: variant.sku || null,
          price: variant.price ?? null,
          stock: variant.stock ?? null,
          isActive: variant.isActive ?? true,
        }).returning();
        if (defaultBranch || stockByBranch) {
          await seedBranchStockForNewItem(tx, {
            storeId,
            productId: product.id,
            variantId: createdVariant.id,
            initialBranchId: initialBranch?.id ?? defaultBranch?.id ?? null,
            initialStock: variant.stock ?? null,
          });
        }
      }
      return product;
    });
  } catch (error) {
    if (isProductNameUniqueViolation(error)) {
      return NextResponse.json({ error: PRODUCT_NAME_TAKEN_MESSAGE }, { status: 409 });
    }
    throw error;
  }
  after(() =>
    logStoreActivity({
      storeId,
      actor: user,
      action: "product.create",
      summary: `Added product "${created.name}"`,
      targetType: "product",
      targetId: created.id,
      metadata: { name: created.name, sku: created.sku || null, price: created.price },
    }),
  );

  return NextResponse.json({ product: created }, { status: 201 });
}
