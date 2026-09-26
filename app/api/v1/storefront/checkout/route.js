import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { addresses, checkoutAttempts, platformSettings, stores } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { resolveStoreByHost, isStoreLive, isForeignCustomer } from "../../../../../lib/resolveStore.js";
import { validate, checkoutSchema } from "../../../../../lib/validate.js";
import { resolveCart, getCartWithItems, computeCartTotals, abandonPendingCheckoutForCart, GUEST_CART_COOKIE } from "../../../../../lib/cart.js";
import { generateOrderNumber, computeOrderTotals } from "../../../../../lib/orders.js";
import { resolveShippingFee } from "../../../../../lib/shipping.js";
import { getSubAccount, initializeTransaction, isValidSubAccountCode } from "../../../../../lib/paystack.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { reserveStock, restockItems, resolveFulfillingBranch, OutOfStockError } from "../../../../../lib/inventory.js";
import { buildRequestUrl } from "../../../../../lib/requestUrl.js";
import { logAppError } from "../../../../../lib/appErrorLog.js";
import { withApiMonitoring } from "../../../../../lib/apiMonitoring.js";

// Postgres' unique_violation code - thrown when two simultaneous checkout
// POSTs race on uq_checkout_attempts_cart_pending (see lib/db/schema.js). We no
// longer resume/reuse old pending orders for payment; a fresh checkout
// submit should price the current cart and create a fresh Paystack
// session. A real race gets a retryable 409 instead of a reused link.
const UNIQUE_VIOLATION = "23505";
const CHECKOUT_LINK_TTL_MS = Number(process.env.PAYSTACK_CHECKOUT_LINK_TTL_MINUTES || 30) * 60 * 1000;
const IN_FLIGHT_CHECKOUT_GRACE_MS = 30_000;

function isPendingCartConflict(err) {
  for (let current = err; current; current = current.cause) {
    if (
      current.code === UNIQUE_VIOLATION
      && (
        current.constraint_name === "uq_orders_cart_pending"
        || current.constraint === "uq_orders_cart_pending"
        || current.constraint_name === "uq_checkout_attempts_cart_pending"
        || current.constraint === "uq_checkout_attempts_cart_pending"
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
    await logAppError(err, {
      source: "checkout.subaccount_repair",
      storeId: store.id,
      metadata: { subAccountId: store.subAccountId || null, hasSubAccountCode: !!store.subAccountCode },
    });
    return null;
  }
}

function checkoutLinkExpiresAt() {
  return new Date(Date.now() + CHECKOUT_LINK_TTL_MS);
}

async function hasInFlightCheckout(cartId) {
  const [pending] = await db
    .select({
      createdAt: checkoutAttempts.createdAt,
      paymentAuthorizationUrl: checkoutAttempts.paymentAuthorizationUrl,
    })
    .from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.cartId, cartId), eq(checkoutAttempts.paymentStatus, "pending")))
    .limit(1);
  if (!pending?.createdAt || pending.paymentAuthorizationUrl) return false;
  return Date.now() - new Date(pending.createdAt).getTime() < IN_FLIGHT_CHECKOUT_GRACE_MS;
}

async function startCheckoutPayment({ attempt, email, customerName, redirectUrl, subAccountCode }) {
  const paymentReference = attempt.paymentReference;
  const expiresAt = checkoutLinkExpiresAt();

  const paystackData = await initializeTransaction({
    amount: attempt.totalAmount,
    email,
    name: customerName,
    reference: paymentReference,
    redirectUrl,
    split: { subAccountCode, amount: attempt.vendorPayoutAmount },
  });
  const confirmedReference = paystackData.reference || paymentReference;

  await db
    .update(checkoutAttempts)
    .set({
      paymentReference: confirmedReference,
      paymentAuthorizationUrl: paystackData.authorizationUrl,
      paymentAuthorizationExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(checkoutAttempts.id, attempt.id), eq(checkoutAttempts.paymentStatus, "pending")));

  return { authorizationUrl: paystackData.authorizationUrl, orderNumber: attempt.orderNumber };
}

async function handlePost(req) {
  const limit = await checkRateLimit(req, "checkout", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store || !isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const subAccountCode = await resolveCheckoutSubAccount(store);
  if (!subAccountCode) {
    return NextResponse.json({ error: "This store's payment setup needs attention. Please contact the seller to relink their payout account." }, { status: 400 });
  }

  const user = await getUser(req);
  if (isForeignCustomer(user, store)) return NextResponse.json({ error: "Sign in to this store to continue" }, { status: 403 });
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
  if (await hasInFlightCheckout(cart.id)) {
    return NextResponse.json({ error: "Checkout is already being prepared. Please try again in a moment." }, { status: 409 });
  }
  await abandonPendingCheckoutForCart(cart.id);

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
    if (item.product.saleMode === "invoice_required") {
      return NextResponse.json(
        { error: `${item.product.name} requires a quote. Remove it from this cart and submit an invoice request instead`, code: "INVOICE_REQUIRED" },
        { status: 409 },
      );
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
  const configuredFlatFee = Math.max(0, Number(settings?.defaultFlatFee) || 0);
  if (!feeChargedToCustomer && configuredFlatFee > flatFeeAmount + 0.001) {
    return NextResponse.json(
      { error: "This order total is too low for the store to absorb the full platform fee. Add more items or choose a different store." },
      { status: 422 },
    );
  }

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

  const attemptItems = items.map((i) => ({
    productId: i.product.id,
    variantId: i.variant?.id || null,
    productName: i.product.name,
    productImage: i.product.images?.[0] || null,
    variantLabel: i.variant ? Object.entries(i.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    customerFields: i.customerFields || {},
  }));

  let attempt;
  let branchId;
  try {
    attempt = await db.transaction(async (tx) => {
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

      // uq_checkout_attempts_cart_pending (lib/db/schema.js) is the
      // idempotency guard for checkout creation. This is not an order yet:
      // it is a reserved, priced payment attempt that can be abandoned
      // without polluting order history.
      const [createdAttempt] = await tx
        .insert(checkoutAttempts)
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
          items: attemptItems,
          paymentReference,
        })
        .returning();

      return createdAttempt;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (isPendingCartConflict(err)) {
      return NextResponse.json({ error: "Checkout is already being prepared. Please try again in a moment." }, { status: 409 });
    }
    await logAppError(err, {
      req,
      user,
      source: "checkout.create_attempt",
      storeId: store.id,
      metadata: { cartId: cart.id, orderNumber, itemCount: items.length },
    });
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
      attempt,
      email,
      customerName,
      redirectUrl,
      subAccountCode,
    });

    return NextResponse.json(paymentSession);
  } catch (err) {
    // The attempt reserved stock before Paystack initialization. If
    // Paystack fails before handing us a usable link, release that stock
    // immediately and fail the attempt so the cart can retry.
    await db.transaction(async (tx) => {
      await restockItems(
        tx,
        items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id || null, quantity: i.quantity, branchId })),
      );
      await tx
        .update(checkoutAttempts)
        .set({ paymentStatus: "failed", updatedAt: new Date() })
        .where(eq(checkoutAttempts.id, attempt.id));
    });
    await logAppError(err, {
      req,
      user,
      source: "checkout.initialize_payment",
      statusCode: 502,
      storeId: store.id,
      metadata: { checkoutAttemptId: attempt.id, cartId: cart.id, orderNumber, totalAmount },
    });
    // Logged above with the upstream detail; the client gets a fixed
    // message rather than Paystack's own error text.
    return NextResponse.json({ error: "We couldn't start the payment. Please try again in a moment." }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.checkout" });
