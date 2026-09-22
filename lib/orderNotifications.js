import { db } from "./db/index.js";
import { customers, stores } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { sendMail } from "./email/sendMail.js";
import { escapeHtml } from "./email/escapeHtml.js";
import { emailButton } from "./email/templates.js";
import { formatCurrency } from "./format.js";
import { sendPushToStore } from "./push.js";
import { getStorefrontOrderUrl } from "./storeUrl.js";

export function orderConfirmationHtml({ order, items, store, recipientEmail }) {
  const itemsHtml = items
    .map((i) => `<tr><td>${escapeHtml(i.productName)}${i.variantLabel ? ` (${escapeHtml(i.variantLabel)})` : ""}</td><td>${i.quantity}</td><td>${formatCurrency(i.lineTotal)}</td></tr>`)
    .join("");
  const orderUrl = getStorefrontOrderUrl(store, order.orderNumber, order.userId ? null : recipientEmail);

  return `<h2>Thanks for your order!</h2><p>Order <strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(store?.name) || "the store"} has been received.</p>${emailButton(orderUrl, "View your order", store?.storefrontAccentColor)}<table>${itemsHtml}</table><p>Total: ${formatCurrency(order.totalAmount)}</p>`;
}

export async function sendOnlineOrderNotifications(order, items) {
  const [store] = await db
    .select({ name: stores.name, ownerId: stores.ownerId, logoUrl: stores.logoUrl, storefrontAccentColor: stores.storefrontAccentColor, slug: stores.slug, customDomain: stores.customDomain, domainStatus: stores.domainStatus })
    .from(stores)
    .where(eq(stores.id, order.storeId))
    .limit(1);

  if (store?.ownerId) {
    sendPushToStore(order.storeId, {
      title: "New order",
      body: `Order ${order.orderNumber} for ${formatCurrency(order.totalAmount)} just came in.`,
      url: "/vendor/orders",
    }).catch((err) => console.error("sendPushToStore failed (new order):", err));
  }

  let recipient = { email: order.guestEmail, notify: true };
  if (order.userId) {
    const [customer] = await db
      .select({ email: customers.email, notify: customers.emailNotificationsEnabled })
      .from(customers)
      .where(eq(customers.id, order.userId))
      .limit(1);
    if (customer) recipient = { email: customer.email, notify: customer.notify };
  }

  if (!recipient.email || !recipient.notify) return;

  await sendMail({
    to: recipient.email,
    subject: `Order confirmation - ${order.orderNumber}`,
    html: orderConfirmationHtml({ order, items, store, recipientEmail: recipient.email }),
    fromName: store?.name,
    brand: store,
    preheader: `Order ${order.orderNumber} has been received`,
  }).catch((err) => console.error("sendMail failed (order confirmation):", err));
}
