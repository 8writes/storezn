import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/db/index.js";
import { invoiceItems, invoicePayments, invoices, orders, stores } from "../../../../../../lib/db/schema.js";
import { initializeTransaction, isValidSubAccountCode } from "../../../../../../lib/paystack.js";
import { withApiMonitoring } from "../../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";
import { z } from "zod";

const paymentEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

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
    invoice: {
      invoiceNumber: row.invoice.invoiceNumber,
      status: row.invoice.status,
      plan: row.invoice.plan,
      totalAmount: row.invoice.totalAmount,
      amountPaid: row.invoice.amountPaid,
      amountDue: row.invoice.amountDue,
      currency: row.invoice.currency,
      buyerName: row.invoice.buyerName,
      note: row.invoice.note,
      expiresAt: row.invoice.expiresAt,
      paidAt: row.invoice.paidAt,
      requiresPaymentEmail: !row.invoice.guestEmail,
      isExpired: row.invoice.status === "expired" || (row.invoice.status === "sent" && row.invoice.expiresAt && new Date(row.invoice.expiresAt).getTime() <= Date.now()),
    },
    items: items.map((item) => ({ id: item.id, productName: item.productName, variantLabel: item.variantLabel, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal, customerFields: item.customerFields })),
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
  if (invoice.status === "sent" && invoice.expiresAt && new Date(invoice.expiresAt).getTime() <= Date.now()) return NextResponse.json({ error: "This invoice has expired" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  let paymentEmail = invoice.guestEmail;
  if (!paymentEmail) {
    const parsedEmail = paymentEmailSchema.safeParse(body?.email);
    if (!parsedEmail.success) return NextResponse.json({ error: parsedEmail.error.issues[0]?.message || "Enter a valid email address" }, { status: 400 });
    paymentEmail = parsedEmail.data;
  }
  const [order] = await db.select().from(orders).where(eq(orders.id, invoice.orderId)).limit(1);
  if (!order || invoice.amountDue <= 0) return NextResponse.json({ error: "This invoice is already paid" }, { status: 409 });
  let reference = `INV-${invoice.invoiceNumber}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const prepared = await db.transaction(async (tx) => {
    const [lockedInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).for("update").limit(1);
    if (!lockedInvoice || !["sent", "partially_paid"].includes(lockedInvoice.status) || (lockedInvoice.status === "sent" && lockedInvoice.expiresAt && new Date(lockedInvoice.expiresAt).getTime() <= Date.now())) return { unavailable: true };
    if (!lockedInvoice.guestEmail) {
      await tx.update(invoices).set({ guestEmail: paymentEmail, updatedAt: new Date() }).where(eq(invoices.id, lockedInvoice.id));
      await tx.update(orders).set({ guestEmail: paymentEmail, updatedAt: new Date() }).where(eq(orders.id, order.id));
    }
    const [existing] = await tx.select().from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
    // A Paystack authorization URL can remain payable after our local
    // polling window. Reuse it until Verify Transaction explicitly says
    // the attempt failed, otherwise two live links could charge twice.
    if (existing?.authorizationUrl) return { existing };
    if (existing && new Date(existing.createdAt).getTime() > Date.now() - 5 * 60 * 1000) return { preparing: true };
    if (existing) await tx.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { ...(existing.metadata || {}), reason: "initialization_interrupted" } }).where(eq(invoicePayments.id, existing.id));
    const [payment] = await tx.insert(invoicePayments).values({ invoiceId: invoice.id, orderId: order.id, paymentReference: reference, kind: lockedInvoice.amountPaid > 0 ? "balance" : lockedInvoice.plan === "deposit" ? "deposit" : "full", status: "pending", amount: lockedInvoice.amountDue }).returning();
    return { payment };
  });
  if (prepared.unavailable) return NextResponse.json({ error: "This invoice is no longer payable" }, { status: 409 });
  if (prepared.preparing) return NextResponse.json({ error: "Payment is already being prepared. Try again shortly." }, { status: 409 });
  if (prepared.existing) return NextResponse.json({ authorizationUrl: prepared.existing.authorizationUrl, reference: prepared.existing.paymentReference });
  const payment = prepared.payment;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  try {
    const paystackData = await initializeTransaction({
      amount: payment.amount,
      email: paymentEmail,
      name: invoice.buyerName || undefined,
      reference,
      redirectUrl: `${baseUrl}/invoice/${shareToken}`,
      split: isValidSubAccountCode(row.store.subAccountCode)
        ? { subAccountCode: row.store.subAccountCode, amount: payment.amount * (order.vendorPayoutAmount / Math.max(order.totalAmount, 1)) }
        : undefined,
      metadata: { invoiceId: invoice.id, orderId: order.id, invoiceNumber: invoice.invoiceNumber },
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.update(invoicePayments).set({ authorizationUrl: paystackData.authorizationUrl, authorizationExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(invoicePayments.id, payment.id));
    return NextResponse.json({ authorizationUrl: paystackData.authorizationUrl, reference });
  } catch (error) {
    await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { error: error.message } }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending")));
    return NextResponse.json({ error: error.message || "Could not start payment" }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.invoice.pay" });
