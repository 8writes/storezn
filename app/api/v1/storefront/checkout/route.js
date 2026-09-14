import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "../../../../../lib/db/index.js";
import { addresses, orders, orderItems, platformSettings, stores } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { resolveStoreByHost, isStoreLive } from "../../../../../lib/resolveStore.js";
import { validate, checkoutSchema } from "../../../../../lib/validate.js";
import { resolveCart, getCartWithItems, computeCartTotals, GUEST_CART_COOKIE } from "../../../../../lib/cart.js";
import { generateOrderNumber, computeOrderTotals } from "../../../../../lib/orders.js";
import { resolveShippingFee } from "../../../../../lib/shipping.js";
import { getSubAccount, initializeTransaction, isValidSubAccountCode } from "../../../../../lib/paystack.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { reserveStock, restockItems, resolveFulfillingBranch, OutOfStockError } from "../../../../../lib/inventory.js";
import { buildRequestUrl } from "../../../../../lib/requestUrl.js";

// Postgres' unique_violation code - thrown when the insert below collides
// with uq_orders_cart_pending (see lib/db/schema.js), i.e. this cart
// already has a pending order from an earlier, still-unresolved request.
const UNIQUE_VIOLATION = "23505";
const CHECKOUT_LINK_TTL_MS = Number(process.env.PAYSTACK_CHECKOUT_LINK_TTL_MINUTES || 30) * 60 * 1000;
const IN_FLIGHT_CHECKOUT_GRACE_MS = 15_000;
const IN_FLIGHT_CHECKOUT_WAIT_MS = 5_000;

function isPendingCartConflict(err) {
  for (let current = err; current; current = current.cause) {
    if (
      current.code === UNIQUE_VIOLATION
      && (
        current.constraint_name === "uq_orders_cart_pending"
        || current.constraint === "uq_orders_cart_pending"
        || current.detail?.includes("Key (cart_id)=")
      )
    ) {
      return true;
    }
  }
  return false;
}

async function resolveCheckoutSubAccount(store) {
  if (isValidSubAccountCode(store.subAccountCode)) return store.subAccountCode;

  const lookupKey = store.subAccountId || store.subAccountCode;
  if (!lookupKey) return null;

  try {
    const subAccount = await getSubAccount(lookupKey);
    if (!isValidSubAccountCode(subAccount?.subaccount_code)) return null;

    await db
      .update(stores)
      .set({ subAccountCode: subAccount.subaccount_code, subAccountId: subAccount.id, updatedAt: new Date() })
      .where(eq(stores.id, store.id));
    return subAccount.subaccount_code;
  } catch (err) {
    console.error("checkout: failed to repair Paystack sub-account", {
      storeId: store.id,
      subAccountId: store.subAccountId || null,
      subAccountCode: store.subAccountCode || null,
      error: err.message,
    });
    return null;
  }
}

function checkoutLinkExpiresAt() {
  return new Date(Date.now() + CHECKOUT_LINK_TTL_MS);
}

function hasFreshCheckoutLink(order) {
  return !!order?.paymentAuthorizationUrl
    && !!order?.paymentAuthorizationExpiresAt
    && new Date(order.paymentAuthorizationExpiresAt).getTime() > Date.now();
}

function retryPaymentReference(orderNumber) {
  return `STOREZN-${orderNumber}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function findPendingOrderForCart(storeId, cartId) {
  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.cartId, cartId), eq(orders.paymentStatus, "pending")))
    .limit(1);
  return existing || null;
}

async function waitForCheckoutLink(orderId) {
  const deadline = Date.now() + IN_FLIGHT_CHECKOUT_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [latest] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (hasFreshCheckoutLink(latest)) return latest;
  }
  return null;
}

async function startCheckoutPayment({ order, email, customerName, redirectUrl, subAccountCode, refreshReference = false }) {
  const paymentReference = refreshReference ? retryPaymentReference(order.orderNumber) : order.paymentReference;
  const expiresAt = checkoutLinkExpiresAt();

  if (refreshReference) {
    await db
      .update(orders)
      .set({
        paymentReference,
        paymentAuthorizationUrl: null,
        paymentAuthorizationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending")));
  }

  const paystackData = await initializeTransaction({
    amount: order.totalAmount,
    email,
    name: customerName,
    reference: paymentReference,
    redirectUrl,
    split: { subAccountCode, amount: order.vendorPayoutAmount },
  });

  await db
    .update(orders)
    .set({
      paymentReference,
      paymentAuthorizationUrl: paystackData.authorizationUrl,
      paymentAuthorizationExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending")));

  return { authorizationUrl: paystackData.authorizationUrl, orderNumber: order.orderNumber };
}

async function resumePendingCheckout({ req, storeId, cartId, email, customerName, redirectUrl, subAccountCode }) {
  const existing = await findPendingOrderForCart(storeId, cartId);
  if (!existing) {
    return NextResponse.json({ error: "This order is already being processed" }, { status: 409 });
  }

  if (hasFreshCheckoutLink(existing)) {
    return NextResponse.json({ authorizationUrl: existing.paymentAuthorizationUrl, orderNumber: existing.orderNumber });
  }

  const ageMs = Date.now() - new Date(existing.createdAt).getTime();
  if (!existing.paymentAuthorizationUrl && ageMs < IN_FLIGHT_CHECKOUT_GRACE_MS) {
    const latest = await waitForCheckoutLink(existing.id);
    if (latest) {
      return NextResponse.json({ authorizationUrl: latest.paymentAuthorizationUrl, orderNumber: latest.orderNumber });
    }
    return NextResponse.json({ error: "Your payment link is still being prepared. Please try again in a moment." }, { status: 409 });
  }

  try {
    const session = await startCheckoutPayment({
      order: existing,
      email: existing.guestEmail || email,
      customerName: existing.shippingAddress?.fullName || customerName,
      redirectUrl: buildRequestUrl(req, `/orders/${existing.orderNumber}`) || redirectUrl,
      subAccountCode,
      refreshReference: true,
    });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not refresh payment link" }, { status: 502 });
  }
}

export async function POST(req) {
  const limit = checkRateLimit(req, "checkout", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store || !isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!store.subAccountCode) {
    return NextResponse.json({ error: "This store hasn't finished payment setup yet" }, { status: 400 });
  }
  const subAccountCode = await resolveCheckoutSubAccount(store);
  if (!subAccountCode) {
    return NextResponse.json({ error: "This store's payment setup needs attention. Please contact the seller to relink their payout account." }, { status: 400 });
  }

  const user = await getUser(req);
  const guestToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (!user && !guestToken) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(checkoutSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { guestEmail, addressId, shippingAddress: rawAddress, note } = result.data;

  if (!user && !guestEmail) {
    return NextResponse.json({ error: "Email is required for guest checkout" }, { status: 400 });
  }

  const cart = await resolveCart({ storeId: store.id, userId: user?.id, guestToken });
  const items = await getCartWithItems(cart.id);
  if (items.length === 0) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });

  for (const item of items) {
    // suspendedAt (super-admin product suspension, see POST .../products/
    // [id]/suspend) is deliberately checked here too, not just isActive -
    // it's a separate flag that never touches isActive, so a product
    // already sitting in someone's cart from before a suspension would
    // otherwise stay checkoutable indefinitely even though every browse
    // path already excludes it.
    if (!item.product.isActive || item.product.suspendedAt || (item.variant && !item.variant.isActive)) {
      return NextResponse.json({ error: `${item.product.name} is no longer available` }, { status: 409 });
    }
    const stock = item.variant ? item.variant.stock : item.product.stock;
    if (item.product.productType === "physical" && stock != null && stock < item.quantity) {
      return NextResponse.json({ error: `Not enough stock for ${item.product.name}` }, { status: 409 });
    }
  }

  const needsShipping = items.some((i) => i.product.productType === "physical");
  let shippingAddress = null;
  if (needsShipping) {
    if (addressId) {
      const [addr] = user
        ? await db.select().from(addresses).where(eq(addresses.id, addressId)).limit(1)
        : [null];
      if (!addr || addr.userId !== user.id) {
        return NextResponse.json({ error: "Address not found" }, { status: 404 });
      }
      shippingAddress = addr;
    } else if (rawAddress) {
      shippingAddress = rawAddress;
    } else {
      return NextResponse.json({ error: "A shipping address is required" }, { status: 400 });
    }
  }

  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  const commissionRatePercent = store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5;
  // The vendor's own choice for their store (see updateVendorStoreSchema),
  // not a platform-wide setting.
  const feeChargedToCustomer = store.feeChargedToCustomer ?? false;
  const { subtotal } = computeCartTotals(items);
  const { fee: resolvedShippingFee, isTBD: shippingFeeTBD } = needsShipping
    ? await resolveShippingFee(store, shippingAddress)
    : { fee: 0, isTBD: false };
  const shippingFee = shippingFeeTBD ? 0 : resolvedShippingFee;
  const { totalAmount, commissionAmount, flatFeeAmount, vendorPayoutAmount } = computeOrderTotals({
    subtotal,
    shippingFee,
    commissionRatePercent,
    flatFee: settings?.defaultFlatFee ?? 0,
    feeChargedToCustomer,
    maxCommissionAmount: settings?.maxCommissionAmount,
  });

  const orderNumber = generateOrderNumber();
  // "STOREZN-" prefix lets the shared Paystack webhook router (hosted on
  // the main company site, see website-ozmictech/lib/paystack.js) tell
  // this product's transactions apart from every other product sharing
  // the same Paystack account, don't drop or rename this prefix without
  // updating that router's PAYSTACK_ROUTE_STOREZN entry to match.
  const paymentReference = `STOREZN-${orderNumber}`;
  const email = user?.email || guestEmail;
  const customerName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || email : (shippingAddress?.fullName || email);
  const redirectUrl = buildRequestUrl(req, `/orders/${orderNumber}`);
  if (!redirectUrl) {
    return NextResponse.json({ error: "Could not build payment return URL" }, { status: 500 });
  }

  let order;
  let branchId;
  try {
    order = await db.transaction(async (tx) => {
      // Buyers never pick a branch - resolve the first one that can
      // fulfill the whole cart (see resolveFulfillingBranch in
      // lib/inventory.js), then reserve against exactly that branch.
      // This is the authoritative check - the pre-check loop above is
      // only a fast, friendly error for the common case.
      branchId = await resolveFulfillingBranch(
        tx,
        store.id,
        items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id || null, quantity: i.quantity, productName: i.product.name })),
      );
      await reserveStock(
        tx,
        items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id || null, quantity: i.quantity, productName: i.product.name, branchId })),
      );

      // uq_orders_cart_pending (lib/db/schema.js) is the actual
      // idempotency guard - a double-click or client retry racing this
      // same cart has its second insert collide with the first request's
      // still-"pending" order and throw, instead of two orders getting
      // created (and possibly two Paystack sessions paid) for one cart.
      const [createdOrder] = await tx
        .insert(orders)
        .values({
          storeId: store.id,
          branchId,
          userId: user?.id || null,
          cartId: cart.id,
          orderNumber,
          guestEmail: user ? null : guestEmail,
          subtotal,
          shippingFee,
          shippingFeeTBD,
          totalAmount,
          commissionRatePercent,
          commissionAmount,
          flatFeeAmount,
          vendorPayoutAmount,
          feeChargedToCustomer,
          shippingAddress,
          note: note || null,
          paymentReference,
        })
        .returning();

      await tx.insert(orderItems).values(
        items.map((i) => ({
          orderId: createdOrder.id,
          productId: i.product.id,
          variantId: i.variant?.id || null,
          productName: i.product.name,
          productImage: i.product.images?.[0] || null,
          variantLabel: i.variant ? Object.entries(i.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          lineTotal: i.lineTotal,
        })),
      );

      return createdOrder;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (isPendingCartConflict(err)) {
      return resumePendingCheckout({ req, storeId: store.id, cartId: cart.id, email, customerName, redirectUrl, subAccountCode });
    }
    throw err;
  }

  try {
    // The vendor's share (vendorPayoutAmount, subtotal + shipping minus
    // commission) is routed straight to their bank account via a Paystack
    // sub-account split, not disbursed by us after the fact, see
    // lib/paystack.js. Whatever isn't split off stays with the platform's
    // main account as commission - we never hold or move the money
    // ourselves.
    const paymentSession = await startCheckoutPayment({
      order,
      email,
      customerName,
      redirectUrl,
      subAccountCode,
    });

    return NextResponse.json(paymentSession);
  } catch (err) {
    // Order was already created with stock reserved for it (see the
    // transaction above) - unlike before, there IS something to roll
    // back now that Paystack init failed, so release the reservation
    // immediately instead of leaving it locked up until the 1-hour stale
    // sweep (lib/failStaleTransactions.js) eventually gets to it.
    // Marking the order "failed" (not just restocking) also frees
    // uq_orders_cart_pending, so the same cart can be checked out again
    // immediately instead of being stuck behind this dead order for up
    // to an hour.
    await db.transaction(async (tx) => {
      await restockItems(
        tx,
        items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id || null, quantity: i.quantity, branchId })),
      );
      await tx.update(orders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(orders.id, order.id));
    });
    return NextResponse.json({ error: err.message || "Could not start payment" }, { status: 502 });
  }
}
