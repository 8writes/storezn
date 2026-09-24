import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { invoices, stores, users } from "./db/schema.js";
import { sendPushToStore } from "./push.js";
import { sendMail } from "./email/sendMail.js";
import { escapeHtml } from "./email/escapeHtml.js";
import { formatCurrency } from "./format.js";

export async function sendInvoicePaymentNotifications(result) {
  if (!result?.applied || !result.invoiceId) return;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId)).limit(1);
  const [store] = invoice
    ? await db.select({ name: stores.name, ownerId: stores.ownerId, logoUrl: stores.logoUrl, storefrontAccentColor: stores.storefrontAccentColor }).from(stores).where(eq(stores.id, invoice.storeId)).limit(1)
    : [];
  if (!invoice || !store) return;

  const tasks = [
    sendPushToStore(invoice.storeId, {
      title: "Invoice payment received",
      body: `${invoice.invoiceNumber}: ${formatCurrency(result.amountPaid)} paid, ${formatCurrency(result.amountDue)} remaining.`,
      url: "/vendor/invoices",
    }),
  ];
  if (store.ownerId) {
    const [owner] = await db.select({ email: users.email, notify: users.emailNotificationsEnabled }).from(users).where(eq(users.id, store.ownerId)).limit(1);
    if (owner?.email && owner.notify !== false) tasks.push(sendMail({
      to: owner.email,
      subject: `Invoice payment received - ${invoice.invoiceNumber}`,
      html: `<p>A payment was received for <strong>${escapeHtml(invoice.invoiceNumber)}</strong>.</p><p>Paid so far: <strong>${escapeHtml(formatCurrency(result.amountPaid))}</strong><br/>Balance: <strong>${escapeHtml(formatCurrency(result.amountDue))}</strong></p>`,
      fromName: store.name,
      brand: store,
      preheader: `Payment received for ${invoice.invoiceNumber}`,
    }));
  }
  if (invoice.guestEmail) tasks.push(sendMail({
    to: invoice.guestEmail,
    subject: `Payment received - ${invoice.invoiceNumber}`,
    html: `<p>We received your payment for <strong>${escapeHtml(invoice.invoiceNumber)}</strong>.</p><p>Paid so far: <strong>${escapeHtml(formatCurrency(result.amountPaid))}</strong><br/>Balance: <strong>${escapeHtml(formatCurrency(result.amountDue))}</strong></p>`,
    fromName: store.name,
    brand: store,
    preheader: `Payment received for ${invoice.invoiceNumber}`,
  }));

  const settled = await Promise.allSettled(tasks);
  for (const outcome of settled) if (outcome.status === "rejected") console.error("Invoice payment notification failed:", outcome.reason);
}
