import { and, eq, ne } from "drizzle-orm";
import { db } from "./db/index.js";
import { invoicePayments, invoices, orders } from "./db/schema.js";

// Paystack allows exactly one webhook URL per account, so in production
// every event for the shared account lands on the company site's router
// and is forwarded on by REFERENCE PREFIX - it dispatches on
// reference.split("-")[0] against a PAYSTACK_ROUTE_<PREFIX> env var (see
// website-ozmictech/lib/paystack.js). Storefront orders use "STOREZN-"
// and subscriptions "STOREZNSUB-"; invoice payments used a bare "INV-",
// which matches no route entry, so their charge.success was never
// forwarded and the payment was only ever confirmed when the
// invoice-maintenance cron polled Paystack - up to ~35 minutes after the
// customer actually paid. Keeping the invoice number inside the reference
// keeps it as greppable in the Paystack dashboard as before.
export function invoicePaymentReference(invoiceNumber) {
  return `STOREZN-${invoiceNumber}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function isInvoicePaymentAuthorizationExpired(payment, now = new Date()) {
  if (!payment?.authorizationExpiresAt) return false;
  return new Date(payment.authorizationExpiresAt).getTime() <= now.getTime();
}

// Reconciles one verified Paystack charge. The payment row is the idempotency
// claim: only a pending row can become paid, so retries cannot increment the
// invoice twice or send duplicate downstream events.
export async function reconcileInvoicePayment({ reference, paystackTransactionId, amountPaid, paidAt = new Date() }) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(invoicePayments).where(eq(invoicePayments.paymentReference, reference)).limit(1);
    if (!payment) return { found: false, applied: false };
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).for("update").limit(1);
    const [lockedPayment] = await tx.select().from(invoicePayments).where(eq(invoicePayments.id, payment.id)).for("update").limit(1);
    if (!lockedPayment) return { found: false, applied: false };
    if (lockedPayment.status === "paid") return { found: true, applied: false, invoiceId: lockedPayment.invoiceId, alreadyPaid: true };
    if (lockedPayment.status !== "pending") return { found: true, applied: false, invoiceId: lockedPayment.invoiceId };
    if (!Number.isFinite(amountPaid) || amountPaid < payment.amount - 0.5 || amountPaid > payment.amount + 0.5) {
      await tx.update(invoicePayments).set({ status: "failed", metadata: { amountPaid, expectedAmount: payment.amount, reason: "amount_mismatch" }, updatedAt: new Date() }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending")));
      return { found: true, applied: false, amountMismatch: true, invoiceId: payment.invoiceId };
    }
    if (!invoice || !["sent", "partially_paid"].includes(invoice.status)) {
      await tx.update(invoicePayments).set({
        status: "failed",
        paystackTransactionId: paystackTransactionId ? String(paystackTransactionId) : null,
        paidAt,
        metadata: { ...(lockedPayment.metadata || {}), reason: "invoice_not_payable", invoiceStatus: invoice?.status || "missing" },
        updatedAt: new Date(),
      }).where(eq(invoicePayments.id, lockedPayment.id));
      return { found: true, applied: false, invoiceId: lockedPayment.invoiceId, invalidInvoiceState: true };
    }
    const [claimed] = await tx.update(invoicePayments).set({ status: "paid", paystackTransactionId: paystackTransactionId ? String(paystackTransactionId) : null, paidAt, updatedAt: new Date() }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending"))).returning();
    if (!claimed) return { found: true, applied: false, invoiceId: payment.invoiceId };
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
