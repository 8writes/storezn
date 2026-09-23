import { and, eq, ne } from "drizzle-orm";
import { db } from "./db/index.js";
import { invoicePayments, invoices, orders } from "./db/schema.js";

// Reconciles one verified Paystack charge. The payment row is the idempotency
// claim: only a pending row can become paid, so retries cannot increment the
// invoice twice or send duplicate downstream events.
export async function reconcileInvoicePayment({ reference, paystackTransactionId, amountPaid, paidAt = new Date() }) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(invoicePayments).where(eq(invoicePayments.paymentReference, reference)).limit(1);
    if (!payment) return { found: false, applied: false };
    if (payment.status === "paid") return { found: true, applied: false, invoiceId: payment.invoiceId, alreadyPaid: true };
    if (payment.status !== "pending") return { found: true, applied: false, invoiceId: payment.invoiceId };
    if (!Number.isFinite(amountPaid) || amountPaid < payment.amount - 0.5 || amountPaid > payment.amount + 0.5) {
      await tx.update(invoicePayments).set({ status: "failed", metadata: { amountPaid, expectedAmount: payment.amount, reason: "amount_mismatch" }, updatedAt: new Date() }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending")));
      return { found: true, applied: false, amountMismatch: true, invoiceId: payment.invoiceId };
    }
    const [claimed] = await tx.update(invoicePayments).set({ status: "paid", paystackTransactionId: paystackTransactionId ? String(paystackTransactionId) : null, paidAt, updatedAt: new Date() }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending"))).returning();
    if (!claimed) return { found: true, applied: false, invoiceId: payment.invoiceId };
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
    if (!invoice) return { found: true, applied: true, invoiceMissing: true };
    const nextPaid = Math.round((invoice.amountPaid + payment.amount) * 100) / 100;
    const fullyPaid = nextPaid >= invoice.totalAmount - 0.5;
    const nextDue = Math.max(0, Math.round((invoice.totalAmount - nextPaid) * 100) / 100);
    const nextStatus = fullyPaid ? "paid" : "partially_paid";
    await tx.update(invoices).set({ amountPaid: Math.min(invoice.totalAmount, nextPaid), amountDue: nextDue, status: nextStatus, paidAt: fullyPaid ? paidAt : null, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    if (invoice.orderId) {
      await tx.update(orders).set({ amountPaid: Math.min(invoice.totalAmount, nextPaid), amountDue: nextDue, paymentStatus: fullyPaid ? "paid" : "partially_paid", status: fullyPaid ? "processing" : "pending", paidAt: fullyPaid ? paidAt : null, updatedAt: new Date() }).where(and(eq(orders.id, invoice.orderId), ne(orders.paymentStatus, "paid")));
    }
    return { found: true, applied: true, invoiceId: invoice.id, orderId: invoice.orderId, fullyPaid, amountPaid: Math.min(invoice.totalAmount, nextPaid), amountDue: nextDue };
  });
}
