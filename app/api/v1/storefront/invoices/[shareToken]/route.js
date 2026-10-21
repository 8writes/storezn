import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/db/index.js";
import { invoiceItems, invoicePayments, invoiceRequests, invoices, orders, stores } from "../../../../../../lib/db/schema.js";
import { initializeTransaction, verifyTransaction } from "../../../../../../lib/paystack.js";
import { resolveStoreSubAccountCode, SUBACCOUNT_UNAVAILABLE_MESSAGE } from "../../../../../../lib/storeSubAccount.js";
import { withApiMonitoring } from "../../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";
import { z } from "zod";
import { buildPublicAppUrl } from "../../../../../../lib/requestUrl.js";
import { invoicePaymentReference, isInvoicePaymentAuthorizationExpired, reconcileInvoicePayment } from "../../../../../../lib/invoicePayments.js";
import { sendInvoicePaymentNotifications } from "../../../../../../lib/invoiceNotifications.js";
import { getUsdRate } from "../../../../../../lib/fxRates.js";
import { INTERNATIONAL_CHANNELS } from "../../../../../../lib/feePolicy.js";

const paymentEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const buyerNameSchema = z.string().trim().min(1, "Enter your name").max(150);
const buyerPhoneSchema = z.string().trim().min(5, "Enter your phone number").max(30);

// A vendor can send an invoice without the customer's details. Whatever's
// missing, the customer must give before paying - checked here, saved to
// the invoice, its order and its request inside the payment transaction.
function missingBuyerDetails(invoice, body) {
  const errors = [];
  const details = {};
  if (!invoice.guestEmail) {
    const parsed = paymentEmailSchema.safeParse(body?.email);
    if (parsed.success) details.guestEmail = parsed.data; else errors.push(parsed.error.issues[0]?.message || "Enter a valid email address");
  }
  if (!invoice.buyerName) {
    const parsed = buyerNameSchema.safeParse(body?.name ?? "");
    if (parsed.success) details.buyerName = parsed.data; else errors.push(parsed.error.issues[0]?.message);
  }
  if (!invoice.buyerPhone) {
    const parsed = buyerPhoneSchema.safeParse(body?.phone ?? "");
    if (parsed.success) details.buyerPhone = parsed.data; else errors.push(parsed.error.issues[0]?.message);
  }
  return { details, error: errors[0] || null };
}

async function loadInvoice(shareToken) {
  const [row] = await db.select({ invoice: invoices, store: stores }).from(invoices).innerJoin(stores, eq(stores.id, invoices.storeId)).where(eq(invoices.shareToken, shareToken)).limit(1);
  return row;
}

export async function GET(req, { params }) {
  const { shareToken } = await params;
  const row = await loadInvoice(shareToken);
  if (!row) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, row.invoice.id));
  const [order] = row.invoice.orderId ? await db.select({
    status: orders.status,
    subtotal: orders.subtotal,
    commissionRatePercent: orders.commissionRatePercent,
    commissionAmount: orders.commissionAmount,
    flatFeeAmount: orders.flatFeeAmount,
    feeChargedToCustomer: orders.feeChargedToCustomer,
    international: orders.international,
  }).from(orders).where(eq(orders.id, row.invoice.orderId)).limit(1) : [];
  // Same dollar view as the storefront (display only - Paystack charges the
  // naira below): opens in $ on a store that accepts international
  // payments, at that store's chosen rate.
  const usdRate = row.store.internationalPaymentsEnabled ? await getUsdRate(row.store.usdRateProvider) : null;
  return NextResponse.json({
    usdRate,
    internationalPaymentsEnabled: !!row.store.internationalPaymentsEnabled,
    invoice: {
      invoiceNumber: row.invoice.invoiceNumber,
      status: row.invoice.status,
      plan: row.invoice.plan,
      totalAmount: row.invoice.totalAmount,
      amountPaid: row.invoice.amountPaid,
      amountDue: row.invoice.amountDue,
      subtotal: order?.subtotal ?? row.invoice.totalAmount,
      commissionRatePercent: order?.commissionRatePercent ?? 0,
      commissionAmount: order?.feeChargedToCustomer ? order.commissionAmount : 0,
      flatFeeAmount: order?.feeChargedToCustomer ? order.flatFeeAmount : 0,
      feeChargedToCustomer: order?.feeChargedToCustomer ?? false,
      // Priced with the international card fee (the customer said so on the
      // quote request) - payment then offers card + Apple Pay only.
      international: order?.international ?? false,
      currency: row.invoice.currency,
      buyerName: row.invoice.buyerName,
      note: row.invoice.note,
      expiresAt: row.invoice.expiresAt,
      paidAt: row.invoice.paidAt,
      orderStatus: order?.status || null,
      requiresPaymentEmail: !row.invoice.guestEmail,
      requiresBuyerName: !row.invoice.buyerName,
      requiresBuyerPhone: !row.invoice.buyerPhone,
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
  const { details: newDetails, error: detailsError } = missingBuyerDetails(invoice, body);
  if (detailsError) return NextResponse.json({ error: detailsError }, { status: 400 });
  const paymentEmail = invoice.guestEmail || newDetails.guestEmail;
  const buyerName = invoice.buyerName || newDetails.buyerName;
  const [order] = await db.select().from(orders).where(eq(orders.id, invoice.orderId)).limit(1);
  if (!order || invoice.amountDue <= 0) return NextResponse.json({ error: "This invoice is already paid" }, { status: 409 });
  // Resolved BEFORE a payment row is created, and fatal if missing - the
  // same bar as storefront checkout. Initializing without a split would
  // take the buyer's money into the platform's main account with nothing
  // routing it to the vendor, which is worse than not taking it at all.
  const subAccountCode = await resolveStoreSubAccountCode(row.store, { source: "invoice_payment" });
  if (!subAccountCode) return NextResponse.json({ error: SUBACCOUNT_UNAVAILABLE_MESSAGE }, { status: 400 });
  let reference = invoicePaymentReference(invoice.invoiceNumber);
  let prepared;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    prepared = await db.transaction(async (tx) => {
      const [lockedInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).for("update").limit(1);
      if (!lockedInvoice || !["sent", "partially_paid"].includes(lockedInvoice.status) || (lockedInvoice.status === "sent" && lockedInvoice.expiresAt && new Date(lockedInvoice.expiresAt).getTime() <= Date.now())) return { unavailable: true };
      // Fill in only what's still blank - never overwrite details the
      // vendor (or an earlier payment attempt) already recorded.
      const fill = {};
      for (const key of ["guestEmail", "buyerName", "buyerPhone"]) {
        if (!lockedInvoice[key] && newDetails[key]) fill[key] = newDetails[key];
      }
      if (Object.keys(fill).length > 0) {
        await tx.update(invoices).set({ ...fill, updatedAt: new Date() }).where(eq(invoices.id, lockedInvoice.id));
        const orderFill = Object.fromEntries(Object.entries(fill).filter(([key]) => !order[key]));
        if (Object.keys(orderFill).length > 0) await tx.update(orders).set({ ...orderFill, updatedAt: new Date() }).where(eq(orders.id, order.id));
        if (lockedInvoice.requestId) {
          const [request] = await tx.select().from(invoiceRequests).where(eq(invoiceRequests.id, lockedInvoice.requestId)).limit(1);
          const requestFill = request ? Object.fromEntries(Object.entries(fill).filter(([key]) => !request[key])) : {};
          if (Object.keys(requestFill).length > 0) await tx.update(invoiceRequests).set({ ...requestFill, updatedAt: new Date() }).where(eq(invoiceRequests.id, request.id));
        }
      }
      // A payment replaced by a vendor edit (metadata.superseded) is left
      // pending - if the customer still finishes that old Paystack page the
      // money is recorded - but it's never handed out again: the next Pay
      // gets a fresh link for the current amount.
      const [existing] = await tx.select().from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"), sql`coalesce((${invoicePayments.metadata}->>'superseded')::boolean, false) = false`)).limit(1);
      // A Paystack authorization URL can remain payable after our local
      // polling window. Reuse it until Verify Transaction explicitly says
      // the attempt failed, otherwise two live links could charge twice.
      if (existing?.authorizationUrl) {
        return isInvoicePaymentAuthorizationExpired(existing) ? { expiredExisting: existing } : { existing };
      }
      if (existing && new Date(existing.createdAt).getTime() > Date.now() - 5 * 60 * 1000) return { preparing: true };
      if (existing) await tx.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { ...(existing.metadata || {}), reason: "initialization_interrupted" } }).where(eq(invoicePayments.id, existing.id));
      const [payment] = await tx.insert(invoicePayments).values({ invoiceId: invoice.id, orderId: order.id, paymentReference: reference, kind: lockedInvoice.amountPaid > 0 ? "balance" : lockedInvoice.plan === "deposit" ? "deposit" : "full", status: "pending", amount: lockedInvoice.amountDue }).returning();
      return { payment };
    });
    if (!prepared.expiredExisting) break;

    try {
      const transaction = await verifyTransaction(prepared.expiredExisting.paymentReference);
      if (transaction.paymentStatus === "PAID") {
        const result = await reconcileInvoicePayment({
          reference: prepared.expiredExisting.paymentReference,
          amountPaid: transaction.amountPaid,
          paidAt: new Date(),
          cardCountry: transaction.cardCountry, paymentChannel: transaction.paymentChannel,
        });
        if (result.applied) await sendInvoicePaymentNotifications(result);
        if (result.fullyPaid) return NextResponse.json({ error: "This invoice is already paid" }, { status: 409 });
        continue;
      }
      if (transaction.paymentStatus === "FAILED") {
        await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { ...(prepared.expiredExisting.metadata || {}), reason: "authorization_failed_after_expiry" } }).where(and(eq(invoicePayments.id, prepared.expiredExisting.id), eq(invoicePayments.status, "pending")));
        reference = invoicePaymentReference(invoice.invoiceNumber);
        continue;
      }
      await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { ...(prepared.expiredExisting.metadata || {}), reason: "authorization_expired_pending" } }).where(and(eq(invoicePayments.id, prepared.expiredExisting.id), eq(invoicePayments.status, "pending")));
      reference = invoicePaymentReference(invoice.invoiceNumber);
      continue;
    } catch {
      // If Paystack cannot be reached, keep returning the single existing
      // link rather than risk creating two payable links for one invoice.
    }
    prepared = { existing: prepared.expiredExisting };
    break;
  }
  if (prepared.unavailable) return NextResponse.json({ error: "This invoice is no longer payable" }, { status: 409 });
  if (prepared.preparing) return NextResponse.json({ error: "Payment is already being prepared. Try again shortly." }, { status: 409 });
  if (prepared.existing) return NextResponse.json({ authorizationUrl: prepared.existing.authorizationUrl, reference: prepared.existing.paymentReference });
  const payment = prepared.payment;
  try {
    const paystackData = await initializeTransaction({
      amount: payment.amount,
      email: paymentEmail,
      name: buyerName || undefined,
      reference,
      redirectUrl: buildPublicAppUrl(req, `/invoice/${shareToken}`),
      // A part-payment splits the same way the whole order would: the
      // vendor's share of this instalment, in the order's own payout
      // ratio (see computeOrderTotals).
      split: { subAccountCode, amount: payment.amount * (order.vendorPayoutAmount / Math.max(order.totalAmount, 1)) },
      metadata: { invoiceId: invoice.id, orderId: order.id, invoiceNumber: invoice.invoiceNumber },
      // Priced with the international card fee on the quote request, so
      // offer the methods a foreign card can actually use.
      channels: order.international ? INTERNATIONAL_CHANNELS : undefined,
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.update(invoicePayments).set({ authorizationUrl: paystackData.authorizationUrl, authorizationExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(invoicePayments.id, payment.id));
    return NextResponse.json({ authorizationUrl: paystackData.authorizationUrl, reference });
  } catch (error) {
    await db.update(invoicePayments).set({ status: "failed", updatedAt: new Date(), metadata: { error: error.message } }).where(and(eq(invoicePayments.id, payment.id), eq(invoicePayments.status, "pending")));
    return NextResponse.json({ error: "We couldn't start the payment. Please try again in a moment." }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.invoice.pay" });
