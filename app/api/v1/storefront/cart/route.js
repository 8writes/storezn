import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { products, productVariants, cartItems, platformSettings } from "../../../../../lib/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { validate, addCartItemSchema } from "../../../../../lib/validate.js";
import { resolveCart, getCartWithItems, computeCartTotals, findCartItem, abandonPendingCheckoutForCart, GUEST_CART_COOKIE } from "../../../../../lib/cart.js";
import { computeOrderTotals } from "../../../../../lib/orders.js";
import { resolveShippingFee } from "../../../../../lib/shipping.js";
import { withApiMonitoring } from "../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { sql } from "drizzle-orm";

function withGuestTokenCookie(res, guestToken, isNewToken) {
  if (isNewToken) {
    res.cookies.set(GUEST_CART_COOKIE, guestToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return res;
}

async function loadStoreForRequest(req) {
  const host = req.headers.get("host") || "";
  return resolveStoreByHost(host);
}

async function handleGet(req) {
  const limit = await checkRateLimit(req, "cart-read", { max: 120, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many cart requests, try again shortly" }, { status: 429 });
  const store = await loadStoreForRequest(req);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const user = await getUser(req);
  const existingToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (!user && !existingToken) {
    return NextResponse.json({ items: [], subtotal: 0, itemCount: 0 });
  }

  const cart = await resolveCart({ storeId: store.id, userId: user?.id, guestToken: existingToken });
  const items = await getCartWithItems(cart.id);
  const totals = computeCartTotals(items);

  // Only priced once a delivery state is known (?state=&city= - the
  // checkout page passes the currently selected/entered address, refetching
  // whenever it changes), and only if the cart actually needs shipping -
  // an all-digital cart is never charged for it regardless of address.
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const city = url.searchParams.get("city");
  const needsShipping = items.some((i) => i.product.productType === "physical");
  const { fee: resolvedShippingFee, isTBD: shippingFeeTBD } =
    needsShipping && state ? await resolveShippingFee(store, { state, city }) : { fee: 0, isTBD: false };
  const shippingFee = shippingFeeTBD ? 0 : resolvedShippingFee;

  const fees = await computeDisplayFees(store, totals.subtotal, shippingFee);

  return NextResponse.json({ items, ...totals, shippingFee, shippingFeeTBD, ...fees });
}

// Live preview of what checkout will actually charge/split, so the cart
// and checkout pages can show the same "Platform fee"/shipping lines (or
// hide them entirely) that POST /api/v1/storefront/checkout will compute
// for real - see lib/orders.js's computeOrderTotals for the shared math.
// store.feeChargedToCustomer is the vendor's own choice for their store
// (see updateVendorStoreSchema), not a platform-wide setting.
async function computeDisplayFees(store, subtotal, shippingFee) {
  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  const commissionRatePercent = store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5;
  const feeChargedToCustomer = store.feeChargedToCustomer ?? false;
  const { totalAmount, platformFeeAmount } = computeOrderTotals({
    subtotal,
    shippingFee,
    commissionRatePercent,
    flatFee: settings?.defaultFlatFee ?? 0,
    feeChargedToCustomer,
    maxCommissionAmount: settings?.maxCommissionAmount,
  });
  return { feeChargedToCustomer, platformFee: feeChargedToCustomer ? platformFeeAmount : 0, total: totalAmount };
}

async function handlePost(req) {
  const limit = await checkRateLimit(req, "cart-add", { max: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many cart updates, try again shortly" }, { status: 429 });
  const store = await loadStoreForRequest(req);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(addCartItemSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { productId, variantId, quantity } = result.data;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, store.id), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // A null variantId is valid even for a product that has variants - the
  // storefront offers the product's own base price/stock as its own
  // "Standard" choice alongside the real variants (see
  // AddToCartButton.js), so "no variant" isn't just the no-variants-exist
  // case anymore - unless the vendor turned that off (allowStandardVariant
  // false), in which case a variant must be chosen.
  let variant = null;
  if (variantId) {
    const variantRows = await db.select().from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)));
    variant = variantRows.find((v) => v.id === variantId);
    if (!variant) return NextResponse.json({ error: "That option is no longer available" }, { status: 404 });
  } else if (product.allowStandardVariant === false) {
    const [anyVariant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)))
      .limit(1);
    if (anyVariant) return NextResponse.json({ error: "Please choose an option" }, { status: 400 });
  }

  const user = await getUser(req);
  const existingToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
  const guestToken = user ? null : existingToken || crypto.randomUUID();

  const cart = await resolveCart({ storeId: store.id, userId: user?.id, guestToken });
  await abandonPendingCheckoutForCart(cart.id);

  const existingItem = await findCartItem(cart.id, productId, variant?.id || null);

  // Checked against the *combined* quantity (already-in-cart + this add),
  // not just what's being added now - otherwise adding 3 more to an
  // already-8-of-10-in-stock cart would pass a check against "3" alone
  // and silently push the cart past what's actually available. This is
  // a friendly pre-check only; the real, race-safe limit is enforced at
  // checkout via reserveStock (see lib/inventory.js).
  const stock = variant ? variant.stock : product.stock;
  const totalQuantity = (existingItem?.quantity || 0) + quantity;
  if (product.productType === "physical" && stock != null && stock < totalQuantity) {
    return NextResponse.json({ error: "Not enough stock available" }, { status: 409 });
  }

  if (existingItem) {
    await db.update(cartItems).set({ quantity: sql`${cartItems.quantity} + ${quantity}` }).where(eq(cartItems.id, existingItem.id));
  } else {
    try {
      await db.insert(cartItems).values({ cartId: cart.id, productId, variantId: variant?.id || null, quantity });
    } catch (err) {
      if (err?.code !== "23505") throw err;
      await db.update(cartItems).set({ quantity: sql`${cartItems.quantity} + ${quantity}` }).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId), variant?.id ? eq(cartItems.variantId, variant.id) : isNull(cartItems.variantId)));
    }
  }

  const items = await getCartWithItems(cart.id);
  const totals = computeCartTotals(items);

  const res = NextResponse.json({ cartId: cart.id, items, ...totals }, { status: 201 });
  return withGuestTokenCookie(res, guestToken, !user && !existingToken);
}

export const GET = withApiMonitoring(handleGet, { source: "storefront.cart.get" });
export const POST = withApiMonitoring(handlePost, { source: "storefront.cart.add" });
