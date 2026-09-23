import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../../../lib/db/index.js";
import { invoicePayments, invoices, orders, stores } from "../../../../lib/db/schema.js";
import { verifyTransaction } from "../../../../lib/paystack.js";
import { reconcileInvoicePayment } from "../../../../lib/invoicePayments.js";
import { releaseInvoiceInventoryHold } from "../../../../lib/invoiceInventory.js";
import { sendMail } from "../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../lib/email/escapeHtml.js";
import { formatCurrency } from "../../../../lib/format.js";

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const pending = await db.select().from(invoicePayments).where(and(eq(invoicePayments.status, "pending"), lte(invoicePayments.authorizationExpiresAt, now))).limit(100);
  let checked = 0;
  let paid = 0;
  let failed = 0;
  for (const payment of pending) {
    try {
      const transaction = await verifyTransaction(payment.paymentReference);
      checked += 1;
      if (transaction.paymentStatus === "PAID") {
        const result = await reconcileInvoicePayment({ reference: payment.paymentReference, amountPaid: transaction.amountPaid, paidAt: new Date() });
        if (result.applied) paid += 1;
      } else if (transaction.paymentStatus === "FAILED") {
        await db.update(invoicePayments).set({ status: "failed", updatedAt: now }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending")));
        failed += 1;
      }
    } catch (error) {
      console.error("invoice maintenance payment check failed", payment.paymentReference, error.message);
    }
  }
  const expiryCandidates = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.status, "sent"), lte(invoices.expiresAt, now))).limit(100);
  let expired = 0;
  let released = 0;
  for (const candidate of expiryCandidates) {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, candidate.id)).for("update").limit(1);
      if (!invoice || invoice.status !== "sent" || invoice.amountPaid > 0) return { expired: false, released: 0 };
      const [pendingPayment] = await tx.select({ id: invoicePayments.id }).from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
      if (pendingPayment) return { expired: false, released: 0 };
      await tx.update(invoices).set({ status: "expired", amountDue: 0, updatedAt: now }).where(eq(invoices.id, invoice.id));
      if (invoice.orderId) await tx.update(orders).set({ status: "abandoned", paymentStatus: "failed", amountDue: 0, updatedAt: now }).where(eq(orders.id, invoice.orderId));
      return { expired: true, released: await releaseInvoiceInventoryHold(tx, invoice.id) };
    });
    if (result.expired) expired += 1;
    released += result.released;
  }
  const reminderCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const reminderSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const reminders = await db
    .select({ invoice: invoices, store: stores })
    .from(invoices)
    .innerJoin(stores, eq(invoices.storeId, stores.id))
    .where(and(inArray(invoices.status, ["sent", "partially_paid"]), lte(invoices.expiresAt, reminderCutoff), or(isNull(invoices.lastReminderAt), lte(invoices.lastReminderAt, reminderSince))))
    .limit(100);
  let reminded = 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  for (const { invoice, store } of reminders) {
    if (!appUrl) break;
    if (!invoice.guestEmail) continue;
    const claimed = await db.update(invoices).set({ lastReminderAt: now, updatedAt: now }).where(and(eq(invoices.id, invoice.id), inArray(invoices.status, ["sent", "partially_paid"]), or(eq(invoices.status, "partially_paid"), isNull(invoices.expiresAt), gte(invoices.expiresAt, now)), or(isNull(invoices.lastReminderAt), lte(invoices.lastReminderAt, reminderSince)))).returning({ id: invoices.id });
    if (claimed.length === 0) continue;
    const link = `${appUrl.replace(/\/$/, "")}/invoice/${invoice.shareToken}`;
    try {
      await sendMail({ to: invoice.guestEmail, subject: `Reminder: invoice ${invoice.invoiceNumber}`, html: `<p>Your invoice from <strong>${escapeHtml(store.name)}</strong> is still awaiting payment.</p><p>Amount due: <strong>${escapeHtml(formatCurrency(invoice.amountDue))}</strong></p><p><a href="${escapeHtml(link)}">View and pay invoice</a></p>`, fromName: store.name, brand: store });
      reminded += 1;
    } catch (error) {
      await db.update(invoices).set({ lastReminderAt: null, updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.lastReminderAt, now)));
      console.error("invoice reminder failed:", error);
    }
  }
  return NextResponse.json({ ok: true, expired, released, checked, paid, failed, reminded });
}
