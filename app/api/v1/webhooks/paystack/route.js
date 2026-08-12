import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders, orderItems, products, productVariants, carts, cartItems, users, stores } from "../../../../../lib/db/schema.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { verifyWebhookSignature, verifyTransaction } from "../../../../../lib/paystack.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { formatCurrency } from "../../../../../lib/format.js";
import { sendPushToUser } from "../../../../../lib/push.js";
import { LOW_STOCK_THRESHOLD } from "../../../../../lib/inventory.js";

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
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const paymentReference = event.data?.reference;
  if (!paymentReference) return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });

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
    sendPushToUser(store.ownerId, {
      title: "New order",
      body: `Order ${order.orderNumber} for ${formatCurrency(order.totalAmount)} just came in.`,
      url: "/vendor/orders",
    }).catch((err) => console.error("sendPushToUser failed (new order):", err));

    for (const p of lowStockNow) {
      sendPushToUser(store.ownerId, {
        title: "Low stock",
        body: `${p.name}${p.variantLabel ? ` (${p.variantLabel})` : ""} is down to ${p.stock} left.`,
        url: "/vendor/products",
      }).catch((err) => console.error("sendPushToUser failed (low stock):", err));
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
