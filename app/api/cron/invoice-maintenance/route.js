import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../../../lib/db/index.js";
import { invoicePayments, invoices, stores } from "../../../../lib/db/schema.js";
import { verifyTransaction } from "../../../../lib/paystack.js";
import { reconcileInvoicePayment } from "../../../../lib/invoicePayments.js";
import { releaseInvoiceInventoryHold } from "../../../../lib/invoiceInventory.js";
import { sendMail } from "../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../lib/email/escapeHtml.js";
import { formatCurrency } from "../../../../lib/format.js";

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const expired = await db.update(invoices).set({ status: "expired", updatedAt: now }).where(and(inArray(invoices.status, ["sent", "partially_paid"]), lte(invoices.expiresAt, now))).returning({ id: invoices.id });
  let released = 0;
  for (const invoice of expired) {
    released += await db.transaction((tx) => releaseInvoiceInventoryHold(tx, invoice.id));
  }
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
  const reminderCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const reminderSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const reminders = await db
    .select({ invoice: invoices, store: stores })
    .from(invoices)
    .innerJoin(stores, eq(invoices.storeId, stores.id))
    .where(and(inArray(invoices.status, ["sent", "partially_paid"]), lte(invoices.expiresAt, reminderCutoff), or(isNull(invoices.lastReminderAt), lte(invoices.lastReminderAt, reminderSince))))
    .limit(100);
  let reminded = 0;
  for (const { invoice, store } of reminders) {
    if (!invoice.guestEmail) continue;
    const claimed = await db.update(invoices).set({ lastReminderAt: now, updatedAt: now }).where(and(eq(invoices.id, invoice.id), or(isNull(invoices.lastReminderAt), lte(invoices.lastReminderAt, reminderSince)))).returning({ id: invoices.id });
    if (claimed.length === 0) continue;
    const link = `${process.env.NEXT_PUBLIC_APP_URL || ""}/invoice/${invoice.shareToken}`;
    await sendMail({ to: invoice.guestEmail, subject: `Reminder: invoice ${invoice.invoiceNumber}`, html: `<p>Your invoice from <strong>${escapeHtml(store.name)}</strong> is still awaiting payment.</p><p>Amount due: <strong>${escapeHtml(formatCurrency(invoice.amountDue))}</strong></p><p><a href="${escapeHtml(link)}">View and pay invoice</a></p>`, fromName: store.name, brand: store }).catch((error) => console.error("invoice reminder failed:", error));
    reminded += 1;
  }
  return NextResponse.json({ ok: true, expired: expired.length, released, checked, paid, failed, reminded });
}
