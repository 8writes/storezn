import { db } from "./db/index.js";
import { carts, cartItems, checkoutAttempts, orders, orderItems, products, productVariants } from "./db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { computeWholesalePrice, stripInternalProductFields } from "./pricing.js";
import { restockItems } from "./inventory.js";

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

  if (userId && guestToken) {
    const [guestCart] = await db
      .select()
      .from(carts)
      .where(and(eq(carts.storeId, storeId), eq(carts.guestToken, guestToken), eq(carts.status, "active")))
      .limit(1);
    if (guestCart) {
      try {
        const [adopted] = await db
          .update(carts)
          .set({ userId, guestToken: null, updatedAt: new Date() })
          .where(eq(carts.id, guestCart.id))
          .returning();
        if (adopted) return adopted;
      } catch (err) {
        if (err?.code === "23505") {
          const [row] = await db
            .select()
            .from(carts)
            .where(and(eq(carts.storeId, storeId), eq(carts.userId, userId), eq(carts.status, "active")))
            .limit(1);
          if (row) return row;
        }
        throw err;
      }
    }
  }

  try {
    const [created] = await db
      .insert(carts)
      .values({ storeId, userId: userId || null, guestToken: userId ? null : guestToken })
      .returning();
    return created;
  } catch (err) {
    // Two near-simultaneous first requests for the same logged-in user
    // (e.g. a double-clicked "add to cart") can both pass the SELECT
    // above before either INSERT lands - uq_carts_store_user_active (a
    // partial unique index on active carts, see lib/db/schema.js) turns
    // the loser's insert into a real constraint violation instead of
    // silently fragmenting the user's items across two active carts.
    // Re-select rather than surface the error - the winner's row is
    // exactly what this caller wanted anyway.
    if (userId && err?.code === "23505") {
      const [row] = await db
        .select()
        .from(carts)
        .where(and(eq(carts.storeId, storeId), eq(carts.userId, userId), eq(carts.status, "active")))
        .limit(1);
      if (row) return row;
    }
    throw err;
  }
}

// The DB's unique index on (cartId, productId, variantId) can't dedup two
// null-variant rows for the same product (NULL is never "equal" to NULL
// in SQL), so a no-variant add-to-cart has to look for the existing row
// itself instead of relying on onConflictDoUpdate.
export async function findCartItem(cartId, productId, variantId, customizationKey = "") {
  const variantCondition = variantId ? eq(cartItems.variantId, variantId) : isNull(cartItems.variantId);
  const [row] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId), variantCondition, eq(cartItems.customizationKey, customizationKey)))
    .limit(1);
  return row;
}

export async function getCartWithItems(cartId) {
  const rows = await db
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      customerFields: cartItems.customerFields,
      product: products,
      variant: productVariants,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => {
    // Bundle/wholesale pricing applies to the base product only (a
    // variant carries its own flat price), same as discountPercent. With
    // bundles the line total isn't unit x qty (whole bundles at the
    // bundle rate, leftovers at full price), so lineTotal is the source
    // of truth and unitPrice is its average. costPrice is stripped - this
    // goes to the storefront client.
    const lineTotal = r.variant?.price != null
      ? r.variant.price * r.quantity
      : computeWholesalePrice(r.product, r.quantity).total;
    return {
      id: r.itemId,
      quantity: r.quantity,
      customerFields: r.customerFields || {},
      product: stripInternalProductFields(r.product),
      variant: r.variant,
      unitPrice: r.quantity > 0 ? lineTotal / r.quantity : lineTotal,
      lineTotal,
    };
  });
}

export function computeCartTotals(items) {
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  return { subtotal, itemCount: items.reduce((sum, i) => sum + i.quantity, 0) };
}

export async function abandonPendingCheckoutForCart(cartId) {
  if (!cartId) return false;
  let abandoned = false;

  const [pendingAttempt] = await db
    .select()
    .from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.cartId, cartId), eq(checkoutAttempts.paymentStatus, "pending")))
    .limit(1);
  if (pendingAttempt) {
    const items = Array.isArray(pendingAttempt.items) ? pendingAttempt.items : [];
    await db.transaction(async (tx) => {
      const released = await tx
        .update(checkoutAttempts)
        .set({
          paymentStatus: "failed",
          paymentAuthorizationUrl: null,
          paymentAuthorizationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(checkoutAttempts.id, pendingAttempt.id), eq(checkoutAttempts.paymentStatus, "pending")))
        .returning({ id: checkoutAttempts.id });
      if (released.length === 0 || !pendingAttempt.branchId) return;

      await restockItems(
        tx,
        items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || null,
          quantity: i.quantity,
          branchId: pendingAttempt.branchId,
        })),
      );
    });
    abandoned = true;
  }

  const [pendingOrder] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.cartId, cartId), eq(orders.paymentStatus, "pending")))
    .limit(1);
  if (!pendingOrder) return abandoned;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, pendingOrder.id));
  await db.transaction(async (tx) => {
    const released = await tx
      .update(orders)
      .set({
        paymentStatus: "failed",
        status: "abandoned",
        paymentAuthorizationUrl: null,
        paymentAuthorizationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, pendingOrder.id), eq(orders.paymentStatus, "pending")))
      .returning({ id: orders.id });
    if (released.length === 0 || !pendingOrder.branchId) return;

    await restockItems(
      tx,
      items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        branchId: pendingOrder.branchId,
      })),
    );
  });

  return true;
}
