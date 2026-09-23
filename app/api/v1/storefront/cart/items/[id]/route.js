import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { cartItems, carts, products, productVariants } from "../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../../../lib/auth.js";
import { validate, updateCartItemSchema } from "../../../../../../../lib/validate.js";
import { getCartWithItems, computeCartTotals, abandonPendingCheckoutForCart, GUEST_CART_COOKIE } from "../../../../../../../lib/cart.js";
import { withApiMonitoring } from "../../../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../../../lib/rateLimit.js";

// Confirms the cart item belongs to the requester's own cart (by user id
// or guest token) before allowing it to be touched - otherwise someone
// could guess another shopper's cart-item id and edit their cart.
async function loadOwnedItem(req, itemId) {
  const user = await getUser(req);
  const guestToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (!user && !guestToken) return null;

  const [row] = await db
    .select({ item: cartItems, cart: carts })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .where(eq(cartItems.id, itemId))
    .limit(1);
  if (!row) return null;

  const owns = row.cart.status === "active" && (user ? row.cart.userId === user.id : row.cart.guestToken === guestToken);
  return owns ? row : null;
}

async function handlePatch(req, { params }) {
  const limit = await checkRateLimit(req, "cart-update", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many cart updates, try again shortly" }, { status: 429 });
  const { id } = await params;
  const owned = await loadOwnedItem(req, id);
  if (!owned) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateCartItemSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await abandonPendingCheckoutForCart(owned.cart.id);

  // Friendly pre-check only (same reasoning as the add-to-cart route) -
  // the real, race-safe limit is enforced at checkout via reserveStock.
  const [product] = await db.select().from(products).where(eq(products.id, owned.item.productId)).limit(1);
  if (product?.saleMode === "invoice_required") {
    return NextResponse.json(
      { error: "This product requires a quote and cannot be checked out in the fixed-price cart", code: "INVOICE_REQUIRED" },
      { status: 409 },
    );
  }
  const variant = owned.item.variantId
    ? (await db.select().from(productVariants).where(eq(productVariants.id, owned.item.variantId)).limit(1))[0]
    : null;
  const stock = variant ? variant.stock : product?.stock;
  if (product?.productType === "physical" && stock != null && stock < result.data.quantity) {
    return NextResponse.json({ error: "Not enough stock available" }, { status: 409 });
  }

  await db.update(cartItems).set({ quantity: result.data.quantity }).where(eq(cartItems.id, id));

  const items = await getCartWithItems(owned.cart.id);
  return NextResponse.json({ items, ...computeCartTotals(items) });
}

async function handleDelete(req, { params }) {
  const limit = await checkRateLimit(req, "cart-delete", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many cart updates, try again shortly" }, { status: 429 });
  const { id } = await params;
  const owned = await loadOwnedItem(req, id);
  if (!owned) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });

  await abandonPendingCheckoutForCart(owned.cart.id);
  await db.delete(cartItems).where(eq(cartItems.id, id));

  const items = await getCartWithItems(owned.cart.id);
  return NextResponse.json({ items, ...computeCartTotals(items) });
}

export const PATCH = withApiMonitoring(handlePatch, { source: "storefront.cart_item.update" });
export const DELETE = withApiMonitoring(handleDelete, { source: "storefront.cart_item.delete" });
