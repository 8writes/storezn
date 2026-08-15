import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { addresses, orders, orderItems, platformSettings } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { resolveStoreByHost, isStoreLive } from "../../../../../lib/resolveStore.js";
import { validate, checkoutSchema } from "../../../../../lib/validate.js";
import { resolveCart, getCartWithItems, computeCartTotals, GUEST_CART_COOKIE } from "../../../../../lib/cart.js";
import { generateOrderNumber, computeOrderTotals } from "../../../../../lib/orders.js";
import { resolveShippingFee } from "../../../../../lib/shipping.js";
import { initializeTransaction } from "../../../../../lib/paystack.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";

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
    if (!item.product.isActive || (item.variant && !item.variant.isActive)) {
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

  const [settings] = await db.select().from(platformSettings).limit(1);
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

  const order = await db.transaction(async (tx) => {
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        storeId: store.id,
        userId: user?.id || null,
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

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  try {
    // The vendor's share (vendorPayoutAmount, subtotal + shipping minus
    // commission) is routed straight to their bank account via a Paystack
    // sub-account split, not disbursed by us after the fact, see
    // lib/paystack.js. Whatever isn't split off stays with the platform's
    // main account as commission - we never hold or move the money
    // ourselves.
    const paystackData = await initializeTransaction({
      amount: totalAmount,
      email,
      name: customerName,
      reference: paymentReference,
      redirectUrl: `${protocol}://${host}/orders/${orderNumber}`,
      split: { subAccountCode: store.subAccountCode, amount: vendorPayoutAmount },
    });

    return NextResponse.json({ authorizationUrl: paystackData.authorizationUrl, orderNumber });
  } catch (err) {
    // Order stays "pending" with no successful Paystack init - the
    // customer can retry checkout later; nothing to roll back since no
    // payment or stock was touched.
    return NextResponse.json({ error: err.message || "Could not start payment" }, { status: 502 });
  }
}
