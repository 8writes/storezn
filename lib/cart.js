import { db } from "./db/index.js";
import { carts, cartItems, products, productVariants } from "./db/schema.js";
import { and, eq, isNull } from "drizzle-orm";

export const GUEST_CART_COOKIE = "ecom_cart_token";

// A cart belongs to exactly one store (mirrors the store-scoped-customer
// model) and is identified either by the logged-in user's id, or by a
// guest token cookie set on first add-to-cart. Finds the existing active
// cart for that identity+store, or creates one.
export async function resolveCart({ storeId, userId, guestToken }) {
  const identityCondition = userId ? eq(carts.userId, userId) : eq(carts.guestToken, guestToken);

  const [existing] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.storeId, storeId), identityCondition, eq(carts.status, "active")))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(carts)
    .values({ storeId, userId: userId || null, guestToken: userId ? null : guestToken })
    .returning();
  return created;
}

// The DB's unique index on (cartId, productId, variantId) can't dedup two
// null-variant rows for the same product (NULL is never "equal" to NULL
// in SQL), so a no-variant add-to-cart has to look for the existing row
// itself instead of relying on onConflictDoUpdate.
export async function findCartItem(cartId, productId, variantId) {
  const variantCondition = variantId ? eq(cartItems.variantId, variantId) : isNull(cartItems.variantId);
  const [row] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId), variantCondition))
    .limit(1);
  return row;
}

export async function getCartWithItems(cartId) {
  const rows = await db
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      product: products,
      variant: productVariants,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => {
    const price = r.variant?.price ?? r.product.price;
    return {
      id: r.itemId,
      quantity: r.quantity,
      product: r.product,
      variant: r.variant,
      unitPrice: price,
      lineTotal: price * r.quantity,
    };
  });
}

export function computeCartTotals(items) {
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  return { subtotal, itemCount: items.reduce((sum, i) => sum + i.quantity, 0) };
}
