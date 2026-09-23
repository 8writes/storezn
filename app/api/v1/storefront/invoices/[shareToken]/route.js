import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/db/index.js";
import { invoiceItems, invoicePayments, invoices, orders, stores } from "../../../../../../lib/db/schema.js";
import { initializeTransaction, isValidSubAccountCode } from "../../../../../../lib/paystack.js";
import { withApiMonitoring } from "../../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";

async function loadInvoice(shareToken) {
  const [row] = await db.select({ invoice: invoices, store: stores }).from(invoices).innerJoin(stores, eq(stores.id, invoices.storeId)).where(eq(invoices.shareToken, shareToken)).limit(1);
  return row;
}

export async function GET(req, { params }) {
  const { shareToken } = await params;
  const row = await loadInvoice(shareToken);
  if (!row) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, row.invoice.id));
  return NextResponse.json({
    invoice: { ...row.invoice, shareToken: undefined },
    items,
    store: { name: row.store.name, logoUrl: row.store.logoUrl, storefrontAccentColor: row.store.storefrontAccentColor, slug: row.store.slug },
  });
}

async function handlePost(req, { params }) {
  const limit = await checkRateLimit(req, "invoice-payment", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many payment attempts, try again shortly" }, { status: 429 });
  const { shareToken } = await params;
  const row = await loadInvoice(shareToken);
  if (!row) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = row.invoice;
  if (!["sent", "partially_paid"].includes(invoice.status)) return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
  if (invoice.expiresAt && new Date(invoice.expiresAt).getTime() <= Date.now()) return NextResponse.json({ error: "This invoice has expired" }, { status: 409 });
  if (!invoice.guestEmail) return NextResponse.json({ error: "The seller has not added a payment email to this invoice" }, { status: 409 });
  const [order] = await db.select().from(orders).where(eq(orders.id, invoice.orderId)).limit(1);
  if (!order || invoice.amountDue <= 0) return NextResponse.json({ error: "This invoice is already paid" }, { status: 409 });
  const [existing] = await db.select().from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
  if (existing?.authorizationUrl && (!existing.authorizationExpiresAt || new Date(existing.authorizationExpiresAt).getTime() > Date.now())) return NextResponse.json({ authorizationUrl: existing.authorizationUrl, reference: existing.paymentReference });
  if (existing) await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date() }).where(and(eq(invoicePayments.id, existing.id), eq(invoicePayments.status, "pending")));
  let reference = `INV-${invoice.invoiceNumber}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let payment;
  try {
    payment = await db.insert(invoicePayments).values({ invoiceId: invoice.id, orderId: order.id, paymentReference: reference, kind: invoice.amountPaid > 0 ? "balance" : invoice.plan === "deposit" ? "deposit" : "full", status: "pending", amount: invoice.amountDue }).returning();
  } catch (error) {
    if (error?.code !== "23505") throw error;
    const [retry] = await db.select().from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
    if (!retry) return NextResponse.json({ error: "Payment is already being prepared. Try again shortly." }, { status: 409 });
    payment = [retry];
    reference = retry.paymentReference;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  try {
    const paystackData = await initializeTransaction({
      amount: invoice.amountDue,
      email: invoice.guestEmail,
      name: invoice.buyerName || undefined,
      reference,
      redirectUrl: `${baseUrl}/invoice/${shareToken}`,
      split: isValidSubAccountCode(row.store.subAccountCode)
        ? { subAccountCode: row.store.subAccountCode, amount: invoice.amountDue * (order.vendorPayoutAmount / Math.max(order.totalAmount, 1)) }
        : undefined,
      metadata: { invoiceId: invoice.id, orderId: order.id, invoiceNumber: invoice.invoiceNumber },
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.update(invoicePayments).set({ authorizationUrl: paystackData.authorizationUrl, authorizationExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(invoicePayments.id, payment[0].id));
    return NextResponse.json({ authorizationUrl: paystackData.authorizationUrl, reference });
  } catch (error) {
    await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { error: error.message } }).where(and(eq(invoicePayments.id, payment[0].id), eq(invoicePayments.status, "pending")));
    return NextResponse.json({ error: error.message || "Could not start payment" }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.invoice.pay" });
