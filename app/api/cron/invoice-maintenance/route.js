import { NextResponse } from "next/server";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "../../../../lib/db/index.js";
import { invoicePayments, invoices } from "../../../../lib/db/schema.js";
import { verifyTransaction } from "../../../../lib/paystack.js";
import { reconcileInvoicePayment } from "../../../../lib/invoicePayments.js";

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const expired = await db.update(invoices).set({ status: "expired", updatedAt: now }).where(and(inArray(invoices.status, ["sent", "partially_paid"]), lte(invoices.expiresAt, now))).returning({ id: invoices.id });
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
  return NextResponse.json({ ok: true, expired: expired.length, checked, paid, failed });
}
