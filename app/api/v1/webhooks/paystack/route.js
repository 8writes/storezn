import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders, orderItems, products, productVariants, carts, cartItems, users, stores } from "../../../../../lib/db/schema.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { verifyWebhookSignature, verifyTransaction } from "../../../../../lib/paystack.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { formatCurrency } from "../../../../../lib/format.js";
import { sendPushToStore } from "../../../../../lib/push.js";
import { LOW_STOCK_THRESHOLD } from "../../../../../lib/inventory.js";

// Storezn+ subscription lifecycle - separate from the order-payment flow
// below, see lib/storePlan.js's getEffectivePlan for how these fields
// actually get enforced.
async function handleSubscriptionCharge(event) {
  const storeId = event.data?.metadata?.storeId;
  if (!storeId) return;
  // charge.success fires before subscription.create - this just marks the
  // store Plus immediately so the vendor isn't waiting on two webhooks in
  // sequence; subscription.create (below) fills in the authoritative
  // subscription code/token/renewal date moments later.
  await db
    .update(stores)
    .set({ plan: "plus", planCancelled: false, planRenewsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) })
    .where(eq(stores.id, storeId));
}

async function handleSubscriptionCreate(event) {
  const email = event.data?.customer?.email;
  if (!email) return;
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!owner) return;
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, owner.id)).limit(1);
  if (!store) return;

  const nextPaymentDate = event.data?.next_payment_date || event.data?.subscription?.next_payment_date;
  await db
    .update(stores)
    .set({
      plan: "plus",
      planCancelled: false,
      paystackSubscriptionCode: event.data?.subscription_code,
      paystackSubscriptionToken: event.data?.email_token,
      paystackCustomerCode: event.data?.customer?.customer_code,
      ...(nextPaymentDate ? { planRenewsAt: new Date(nextPaymentDate) } : {}),
    })
    .where(eq(stores.id, store.id));
}

async function handleSubscriptionDisable(event) {
  const code = event.data?.subscription_code;
  if (!code) return;
  await db.update(stores).set({ planCancelled: true }).where(eq(stores.paystackSubscriptionCode, code));
}

// This is registered directly on Paystack only in local/single-product
// dev. In production, website-ozmictech's shared webhook router receives
// every Paystack event for the shared account (Paystack allows exactly
// one webhook URL per account) and forwards ones with a "STOREZN-"
// reference prefix here untouched, see
// website-ozmictech/lib/paystack.js. Either way this endpoint re-verifies
// the signature itself and never trusts a forward on its own.
//
// The source of truth for "did this order actually get paid" - never the
// client-side redirect back to redirectUrl, which a user can hit without
// having paid. Verifies both the webhook signature AND re-checks the
// transaction status directly with Paystack before trusting it.
export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "subscription.create") {
    await handleSubscriptionCreate(event);
    return NextResponse.json({ received: true });
  }
  if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    await handleSubscriptionDisable(event);
    return NextResponse.json({ received: true });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const paymentReference = event.data?.reference;
  if (!paymentReference) return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });

  if (paymentReference.startsWith("STOREZNSUB-")) {
    await handleSubscriptionCharge(event);
    return NextResponse.json({ received: true });
  }

  const [order] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.paymentStatus === "paid") return NextResponse.json({ received: true });

  const transaction = await verifyTransaction(paymentReference);
  if (transaction.paymentStatus !== "PAID") {
    await db.update(orders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(orders.id, order.id));
    return NextResponse.json({ received: true });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const lowStockNow = [];

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ paymentStatus: "paid", status: "processing", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // Decremented via a raw SQL expression (not a read-then-write) to
    // stay correct under concurrent orders for the same product/variant.
    // Only touches rows that actually track stock (physical, non-null
    // stock) - a variant's own stock is authoritative when one was
    // ordered, since the parent product's stock is ignored once it has
    // variants. .returning() gives back the post-decrement stock, which
    // is enough (added to this item's own quantity) to derive the
    // pre-decrement value too, without a separate read - used below to
    // detect crossing into low stock without a second query.
    for (const item of items) {
      if (item.variantId) {
        const [updated] = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
          .where(and(eq(productVariants.id, item.variantId), isNotNull(productVariants.stock)))
          .returning({ stock: productVariants.stock });
        if (updated) {
          const before = updated.stock + item.quantity;
          if (before > LOW_STOCK_THRESHOLD && updated.stock <= LOW_STOCK_THRESHOLD) {
            lowStockNow.push({ name: item.productName, variantLabel: item.variantLabel, stock: updated.stock });
          }
        }
      } else {
        const [updated] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), isNotNull(products.stock)))
          .returning({ stock: products.stock });
        if (updated) {
          const before = updated.stock + item.quantity;
          if (before > LOW_STOCK_THRESHOLD && updated.stock <= LOW_STOCK_THRESHOLD) {
            lowStockNow.push({ name: item.productName, variantLabel: item.variantLabel, stock: updated.stock });
          }
        }
      }
    }

    if (order.userId) {
      const [cart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.storeId, order.storeId), eq(carts.userId, order.userId), eq(carts.status, "active")))
        .limit(1);
      if (cart) {
        await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
        await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, cart.id));
      }
    }
  });

  let recipient = { email: order.guestEmail, notify: true };
  if (order.userId) {
    const [customer] = await db
      .select({ email: users.email, notify: users.emailNotificationsEnabled })
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);
    if (customer) recipient = { email: customer.email, notify: customer.notify };
  }

  const [store] = await db
    .select({ name: stores.name, ownerId: stores.ownerId })
    .from(stores)
    .where(eq(stores.id, order.storeId))
    .limit(1);

  if (store?.ownerId) {
    // Operational, not owner-only - staff can act on both of these
    // (see canManageStore vs isStoreOwner in lib/auth.js), so the whole
    // store team gets notified, not just the vendor.
    sendPushToStore(order.storeId, {
      title: "New order",
      body: `Order ${order.orderNumber} for ${formatCurrency(order.totalAmount)} just came in.`,
      url: "/vendor/orders",
    }).catch((err) => console.error("sendPushToStore failed (new order):", err));

    for (const p of lowStockNow) {
      sendPushToStore(order.storeId, {
        title: "Low stock",
        body: `${p.name}${p.variantLabel ? ` (${p.variantLabel})` : ""} is down to ${p.stock} left.`,
        url: "/vendor/products",
      }).catch((err) => console.error("sendPushToStore failed (low stock):", err));
    }
  }

  if (recipient.email && recipient.notify) {
    const itemsHtml = items
      .map((i) => `<tr><td>${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ""}</td><td>${i.quantity}</td><td>${formatCurrency(i.lineTotal)}</td></tr>`)
      .join("");
    await sendMail({
      to: recipient.email,
      subject: `Order confirmation - ${order.orderNumber}`,
      html: `<h2>Thanks for your order!</h2><p>Order <strong>${order.orderNumber}</strong> from ${store?.name || "the store"} has been received.</p><table>${itemsHtml}</table><p>Total: ${formatCurrency(order.totalAmount)}</p>`,
      fromName: store?.name,
    }).catch((err) => console.error("sendMail failed (order confirmation):", err));
  }

  return NextResponse.json({ received: true });
}
