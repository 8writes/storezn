import { products, productVariants, productBranchStock, branches } from "./db/schema.js";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";

// Shared between the vendor stats route (app/api/v1/vendor/stores/
// [storeId]/stats/route.js, the dashboard's "Low stock" card) and the
// Paystack webhook's low-stock-crossing push notification - both need
// the exact same definition of "low", not two constants that could
// silently drift apart.
export const LOW_STOCK_THRESHOLD = 5;

export class OutOfStockError extends Error {
  constructor(productName) {
    super(`Not enough stock for ${productName}`);
    this.name = "OutOfStockError";
    this.productName = productName;
  }
}

function branchStockCondition(productId, variantId, branchId) {
  return and(
    eq(productBranchStock.productId, productId),
    variantId ? eq(productBranchStock.variantId, variantId) : isNull(productBranchStock.variantId),
    eq(productBranchStock.branchId, branchId),
  );
}

// products.stock/productVariants.stock stay in place as a cached SUM
// across a product's/variant's branches (NULL only if every branch is
// unlimited, otherwise the sum of the non-null ones) - every write below
// calls this afterward so the ~15 display-only places that read those
// two columns directly (storefront, vendor dashboard, super-admin) never
// needed to change for multi-branch to exist.
async function syncAggregate(tx, productId, variantId) {
  const rows = await tx
    .select({ stock: productBranchStock.stock })
    .from(productBranchStock)
    .where(and(eq(productBranchStock.productId, productId), variantId ? eq(productBranchStock.variantId, variantId) : isNull(productBranchStock.variantId)));

  const nonNull = rows.filter((r) => r.stock != null);
  const aggregate = nonNull.length === 0 ? null : nonNull.reduce((sum, r) => sum + r.stock, 0);

  if (variantId) {
    await tx.update(productVariants).set({ stock: aggregate }).where(eq(productVariants.id, variantId));
  } else {
    await tx.update(products).set({ stock: aggregate }).where(eq(products.id, productId));
  }
}

// Atomically reserves stock at a specific branch (null stock at that
// branch = unlimited, silently skipped). The guarded `stock >= quantity`
// in the WHERE clause is what actually prevents overselling under
// concurrency - two transactions racing for the last unit at the same
// branch serialize on this UPDATE's row lock (drizzle-orm/postgres-js's
// tx callback holds a dedicated connection, see lib/db/index.js); the
// loser's guard simply matches zero rows once it's their turn. Must run
// inside the same `tx` as whatever creates the order, so throwing
// OutOfStockError rolls the reservation back along with everything else.
//
// allowNegative: for a register sale the goods are already in the
// customer's hand - refusing it because the computer thinks stock is 0
// is the wrong outcome (and impossible to enforce anyway once a sale was
// rung offline against a stale local count). With this set the decrement
// is unguarded: it always goes through and stock can land below zero,
// which the vendor sees and corrects. Used by the POS routes only;
// storefront checkout stays guarded.
// items: [{ productId, variantId, quantity, productName, branchId }]
export async function reserveStock(tx, items, { allowNegative = false } = {}) {
  const orderedItems = [...items].sort((a, b) => `${a.productId}:${a.variantId || ""}`.localeCompare(`${b.productId}:${b.variantId || ""}`));
  for (const item of orderedItems) {
    const guard = allowNegative
      ? and(branchStockCondition(item.productId, item.variantId, item.branchId), isNotNull(productBranchStock.stock))
      : and(
          branchStockCondition(item.productId, item.variantId, item.branchId),
          isNotNull(productBranchStock.stock),
          sql`${productBranchStock.stock} >= ${item.quantity}`,
        );

    const [updated] = await tx
      .update(productBranchStock)
      .set({ stock: sql`${productBranchStock.stock} - ${item.quantity}` })
      .where(guard)
      .returning({ stock: productBranchStock.stock });

    if (!updated) {
      const [row] = await tx.select({ stock: productBranchStock.stock }).from(productBranchStock).where(branchStockCondition(item.productId, item.variantId, item.branchId)).limit(1);
      // No row at all, or an explicit null, both mean "not tracked at
      // this branch" - nothing to reserve, not an error. (allowNegative
      // never lands here for a tracked row - the guard always matches.)
      if (!allowNegative && row && row.stock != null) throw new OutOfStockError(item.productName);
      continue;
    }

    await syncAggregate(tx, item.productId, item.variantId);
  }
}

// Releases a reservation - order failed/was cancelled/refunded after
// reserveStock already decremented it. Plain increment, no guard needed.
// items: [{ productId, variantId, quantity, branchId }]
export async function restockItems(tx, items) {
  const orderedItems = [...items].sort((a, b) => `${a.productId}:${a.variantId || ""}`.localeCompare(`${b.productId}:${b.variantId || ""}`));
  for (const item of orderedItems) {
    const [updated] = await tx
      .update(productBranchStock)
      .set({ stock: sql`${productBranchStock.stock} + ${item.quantity}` })
      .where(and(branchStockCondition(item.productId, item.variantId, item.branchId), isNotNull(productBranchStock.stock)))
      .returning({ stock: productBranchStock.stock });
    if (updated) await syncAggregate(tx, item.productId, item.variantId);
  }
}

// Buyers never pick a branch (see lib/db/schema.js's orders.branchId
// comment), so online checkout has to resolve one automatically. Keeps
// "one order = one branch" - iterates the store's branches in creation
// order and returns the first one that has enough stock for EVERY item
// in the cart, so an order is never split across locations (one
// shipment, one "mark as shipped", one invoice, clean staff visibility).
// If no single branch can fulfill the whole cart - even if the sum
// across branches could - this throws on whichever item is the
// bottleneck at the branch it got furthest with, same error UX as
// before branches existed, just resolved underneath. A deliberate v1
// limitation, see the multi-branch plan's own callout.
// items: [{ productId, variantId, quantity, productName }]
export async function resolveFulfillingBranch(tx, storeId, items) {
  const storeBranches = await tx.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  if (storeBranches.length === 0) throw new Error(`Store ${storeId} has no branches`);

  const orderedItems = [...items].sort((a, b) => `${a.productId}:${a.variantId || ""}`.localeCompare(`${b.productId}:${b.variantId || ""}`));
  let lastFailure = null;
  for (const branch of storeBranches) {
    let ok = true;
    for (const item of orderedItems) {
      const [row] = await tx
        .select({ stock: productBranchStock.stock })
        .from(productBranchStock)
        .where(branchStockCondition(item.productId, item.variantId, branch.id))
        .for("update")
        .limit(1);
      if (row && row.stock != null && row.stock < item.quantity) {
        ok = false;
        lastFailure = item.productName;
        break;
      }
    }
    if (ok) return branch.id;
  }
  throw new OutOfStockError(lastFailure || items[0]?.productName || "item");
}

// Sets a branch's stock to an explicit value (vendor editing stock
// directly, or seeding a new branch/product/variant) rather than
// reserving/releasing a quantity - upserts since a (product, variant,
// branch) row may not exist yet (see productBranchStock's unique
// indexes in lib/db/schema.js for the null-variant partial-index shape
// this mirrors).
export async function setBranchStock(tx, { productId, variantId, branchId, stock }) {
  const existing = await tx.select({ id: productBranchStock.id }).from(productBranchStock).where(branchStockCondition(productId, variantId, branchId)).limit(1);
  if (existing.length > 0) {
    await tx.update(productBranchStock).set({ stock }).where(branchStockCondition(productId, variantId, branchId));
  } else {
    await tx.insert(productBranchStock).values({ productId, variantId: variantId || null, branchId, stock });
  }
  await syncAggregate(tx, productId, variantId);
}

// Adds `delta` to a branch's current stock (bulk "add to existing stock"
// mode). Race-safe: the add happens in SQL, not read-modify-write in JS.
// A missing row is treated as 0 and created at `delta`. Returns the new
// stock so the caller can report it.
export async function addBranchStock(tx, { productId, variantId, branchId, delta }) {
  const existing = await tx
    .select({ stock: productBranchStock.stock })
    .from(productBranchStock)
    .where(branchStockCondition(productId, variantId, branchId))
    .limit(1);
  let next;
  if (existing.length > 0) {
    next = Math.max(0, (existing[0].stock ?? 0) + delta);
    await tx
      .update(productBranchStock)
      .set({ stock: sql`GREATEST(0, COALESCE(${productBranchStock.stock}, 0) + ${delta})` })
      .where(branchStockCondition(productId, variantId, branchId));
  } else {
    next = Math.max(0, delta);
    await tx.insert(productBranchStock).values({ productId, variantId: variantId || null, branchId, stock: next });
  }
  await syncAggregate(tx, productId, variantId);
  return next;
}

// A new product/variant only ever starts stocked at one branch (the
// store's default, or whichever branch the create form was scoped to)
// - every other existing branch gets an explicit 0 row rather than no
// row at all, so "no productBranchStock row for this branch" never has
// to be treated as ambiguous (see reserveStock/restockItems above,
// which treat a genuinely missing row the same as an explicit null -
// unlimited - which would be wrong if it actually meant "just hasn't
// been stocked here yet").
// initialBranchId/initialStock = the single-branch case (all stock at the
// default branch). stockByBranch = an explicit { branchId: stock } map
// from a multi-branch store's create form - any branch it omits gets 0,
// and it takes precedence over initialBranchId/initialStock.
export async function seedBranchStockForNewItem(tx, { storeId, productId, variantId, initialBranchId, initialStock, stockByBranch }) {
  const storeBranches = await tx.select({ id: branches.id }).from(branches).where(eq(branches.storeId, storeId));
  for (const branch of storeBranches) {
    let stock;
    if (stockByBranch) {
      stock = Object.prototype.hasOwnProperty.call(stockByBranch, branch.id) ? stockByBranch[branch.id] : 0;
    } else {
      stock = branch.id === initialBranchId ? initialStock : 0;
    }
    await tx.insert(productBranchStock).values({
      productId,
      variantId: variantId || null,
      branchId: branch.id,
      stock,
    });
  }
  await syncAggregate(tx, productId, variantId);
}

// A newly created branch starts with zero of everything that exists so
// far - same "always a row" invariant as above, from the other
// direction (new branch, existing products) instead of (existing
// branches, new product). Batched: a supermarket-sized catalogue is
// thousands of products, and one-INSERT-per-product-plus-a-SELECT-for-
// its-variants ran to minutes and could time out the request half-way.
export async function seedNewBranchStock(tx, storeId, branchId) {
  const [storeProducts, storeVariants] = await Promise.all([
    tx.select({ id: products.id }).from(products).where(eq(products.storeId, storeId)),
    tx
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(products.storeId, storeId)),
  ]);

  const rows = [
    ...storeProducts.map((p) => ({ productId: p.id, variantId: null, branchId, stock: 0 })),
    ...storeVariants.map((v) => ({ productId: v.productId, variantId: v.id, branchId, stock: 0 })),
  ];
  if (rows.length === 0) return;

  // Multi-row inserts, chunked so a huge catalogue stays well under
  // Postgres' bind-parameter ceiling and doesn't hold the connection for
  // one enormous statement.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(productBranchStock).values(rows.slice(i, i + CHUNK));
  }
}
