import { products, productVariants } from "./db/schema.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";

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

// Atomically reserves stock for every item that tracks it (null stock =
// unlimited/digital, silently skipped). The guarded `stock >= quantity`
// in the WHERE clause is what actually prevents overselling under
// concurrency - two transactions racing for the last unit serialize on
// this UPDATE's row lock (drizzle-orm/postgres-js's tx callback holds a
// dedicated connection, see lib/db/index.js); the loser's guard simply
// matches zero rows once it's their turn. Must run inside the same `tx`
// as whatever creates the order, so throwing OutOfStockError rolls the
// reservation back along with everything else in that transaction.
export async function reserveStock(tx, items) {
  for (const item of items) {
    if (item.variantId) {
      const [updated] = await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
        .where(
          and(
            eq(productVariants.id, item.variantId),
            isNotNull(productVariants.stock),
            sql`${productVariants.stock} >= ${item.quantity}`,
          ),
        )
        .returning({ stock: productVariants.stock });
      if (!updated) {
        const [row] = await tx.select({ stock: productVariants.stock }).from(productVariants).where(eq(productVariants.id, item.variantId)).limit(1);
        if (row && row.stock != null) throw new OutOfStockError(item.productName);
      }
    } else {
      const [updated] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            isNotNull(products.stock),
            sql`${products.stock} >= ${item.quantity}`,
          ),
        )
        .returning({ stock: products.stock });
      if (!updated) {
        const [row] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, item.productId)).limit(1);
        if (row && row.stock != null) throw new OutOfStockError(item.productName);
      }
    }
  }
}

// Releases a reservation - order failed/was cancelled/refunded after
// reserveStock already decremented it. Plain increment, no guard needed.
export async function restockItems(tx, items) {
  for (const item of items) {
    if (item.variantId) {
      await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
        .where(and(eq(productVariants.id, item.variantId), isNotNull(productVariants.stock)));
    } else {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(and(eq(products.id, item.productId), isNotNull(products.stock)));
    }
  }
}
