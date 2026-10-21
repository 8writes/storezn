import { NextResponse, after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import { invoiceItems, invoicePayments, invoiceRequests, invoices, orderItems, orders, platformSettings, products, stores } from "../../../../../../../../lib/db/schema.js";
import { validate, updateInvoiceSchema } from "../../../../../../../../lib/validate.js";
import { computeOrderTotals } from "../../../../../../../../lib/orders.js";
import { resolveFeePolicy } from "../../../../../../../../lib/feePolicy.js";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { releaseInvoiceInventoryHold } from "../../../../../../../../lib/invoiceInventory.js";
import { withApiMonitoring } from "../../../../../../../../lib/apiMonitoring.js";
import { sendMail } from "../../../../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../../../../lib/email/escapeHtml.js";
import { formatCurrency } from "../../../../../../../../lib/format.js";
import { logStoreActivity } from "../../../../../../../../lib/storeActivity.js";

async function load(req, params) {
  const user = await getUser(req);
  const { storeId, invoiceId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.storeId, storeId))).limit(1);
  if (!invoice) return { error: NextResponse.json({ error: "Invoice not found" }, { status: 404 }) };
  return { user, store, invoice };
}

async function handleGet(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const [itemRows, payments, orderRows] = await Promise.all([
    db
      .select({ item: invoiceItems, productImages: products.images })
      .from(invoiceItems)
      .leftJoin(products, eq(products.id, invoiceItems.productId))
      .where(eq(invoiceItems.invoiceId, loaded.invoice.id))
      .orderBy(invoiceItems.createdAt),
    db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, loaded.invoice.id)).orderBy(desc(invoicePayments.createdAt)),
    loaded.invoice.orderId
      ? db.select().from(orders).where(and(eq(orders.id, loaded.invoice.orderId), eq(orders.storeId, loaded.invoice.storeId))).limit(1)
      : Promise.resolve([]),
  ]);
  const items = itemRows.map(({ item, productImages }) => ({ ...item, productImage: productImages?.[0] || null }));
  return NextResponse.json({ invoice: loaded.invoice, items, payments, order: orderRows[0] || null });
}

async function handlePatch(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const body = await req.json().catch(() => null);
  if (body?.action === "update") return updateInvoice(loaded, body);
  if (body?.action !== "cancel") return NextResponse.json({ error: "Unsupported invoice action" }, { status: 400 });
  const now = new Date();
  const cancelled = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, loaded.invoice.id), eq(invoices.storeId, loaded.invoice.storeId))).for("update").limit(1);
    if (!invoice || invoice.status !== "sent" || invoice.amountPaid > 0) return false;
    const [pendingPayment] = await tx.select({ id: invoicePayments.id }).from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
    if (pendingPayment) return false;
    await tx.update(invoices).set({ status: "cancelled", amountDue: 0, updatedAt: now }).where(eq(invoices.id, invoice.id));
    if (invoice.orderId) await tx.update(orders).set({ status: "cancelled", paymentStatus: "failed", amountDue: 0, updatedAt: now }).where(eq(orders.id, invoice.orderId));
    if (invoice.requestId) await tx.update(invoiceRequests).set({ status: "cancelled", updatedAt: now }).where(eq(invoiceRequests.id, invoice.requestId));
    await releaseInvoiceInventoryHold(tx, invoice.id);
    return true;
  });
  if (!cancelled) return NextResponse.json({ error: "Only an unpaid invoice without an active payment can be cancelled" }, { status: 409 });
  if (loaded.invoice.guestEmail) {
    after(() => sendMail({
      to: loaded.invoice.guestEmail,
      subject: `Invoice ${loaded.invoice.invoiceNumber} was cancelled`,
      html: `<p>Hello${loaded.invoice.buyerName ? ` ${escapeHtml(loaded.invoice.buyerName)}` : ""},</p><p><strong>${escapeHtml(loaded.store.name)}</strong> cancelled invoice <strong>${escapeHtml(loaded.invoice.invoiceNumber)}</strong>.</p><p>No payment is due. The cancelled total was ${escapeHtml(formatCurrency(loaded.invoice.totalAmount))}.</p>`,
      fromName: loaded.store.name,
      brand: loaded.store,
      preheader: `Invoice ${loaded.invoice.invoiceNumber} was cancelled`,
    }).catch((error) => console.error("sendMail failed (invoice cancellation):", error)));
  }
  after(() => logStoreActivity({
    storeId: loaded.invoice.storeId,
    actor: loaded.user,
    action: "invoice.cancel",
    summary: `Cancelled invoice ${loaded.invoice.invoiceNumber}`,
    targetType: "invoice",
    targetId: loaded.invoice.id,
    metadata: { orderId: loaded.invoice.orderId, totalAmount: loaded.invoice.totalAmount },
  }));
  return NextResponse.json({ ok: true });
}

class InvoiceEditError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

// Change an invoice the customer hasn't paid anything on yet: prices,
// payment plan, customer details, note. Same link, same invoice number.
// Refused once any money is in, or while a payment is in progress - the
// customer may be on Paystack's page for the old amount, and a different
// amount arriving would be rejected as a mismatch after they've paid.
// Totals and fees are recomputed exactly as when the invoice was created.
async function updateInvoice(loaded, body) {
  const result = validate(updateInvoiceSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const data = result.data;
  const now = new Date();
  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);

  try {
    const updated = await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, loaded.invoice.id), eq(invoices.storeId, loaded.invoice.storeId))).for("update").limit(1);
      if (!invoice || invoice.status !== "sent" || Number(invoice.amountPaid) > 0) throw new InvoiceEditError("Only an invoice with nothing paid yet can be changed");
      if (invoice.expiresAt && new Date(invoice.expiresAt).getTime() <= now.getTime()) throw new InvoiceEditError("This invoice has expired - create a new one instead");
      const [pendingPayment] = await tx.select({ id: invoicePayments.id }).from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
      if (pendingPayment) throw new InvoiceEditError("The customer has started paying this invoice. Wait until the payment finishes or fails, then try again.");
      const [order] = invoice.orderId ? await tx.select().from(orders).where(eq(orders.id, invoice.orderId)).for("update").limit(1) : [];
      if (!order) throw new InvoiceEditError("This invoice can't be changed");

      const lines = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
      const priceById = new Map(data.items.map((item) => [item.id, item.unitPrice]));
      if (lines.length !== priceById.size || lines.some((line) => !priceById.has(line.id))) {
        throw new InvoiceEditError("Add a price for every item on the invoice", 400);
      }
      const subtotal = lines.reduce((sum, line) => sum + priceById.get(line.id) * line.quantity, 0);
      const feePolicy = resolveFeePolicy({ store: loaded.store, settings, international: order.international === true });
      const totals = computeOrderTotals({
        subtotal,
        shippingFee: 0,
        commissionRatePercent: feePolicy.commissionRatePercent,
        flatFee: feePolicy.flatFee,
        feeChargedToCustomer: feePolicy.feeChargedToCustomer,
        maxCommissionAmount: feePolicy.maxCommissionAmount,
      });
      if (!feePolicy.feeChargedToCustomer && feePolicy.flatFee > totals.flatFeeAmount + 0.001) {
        throw new InvoiceEditError("This total is too low for the store to absorb the full Processing Fee. Increase the price.", 422);
      }
      const depositAmount = data.plan === "deposit" ? Math.round(totals.totalAmount * (data.depositPercent ?? 50)) / 100 : null;
      const amountDue = depositAmount ?? totals.totalAmount;

      // Lines: the invoice copy and the order copy (matched by product,
      // option and name - unique within one invoice).
      const lineKey = (line) => `${line.productId || ""}:${line.variantId || ""}:${line.productName}`;
      const priceByKey = new Map();
      for (const line of lines) {
        const unitPrice = priceById.get(line.id);
        priceByKey.set(lineKey(line), unitPrice);
        await tx.update(invoiceItems).set({ unitPrice, lineTotal: unitPrice * line.quantity }).where(eq(invoiceItems.id, line.id));
      }
      const orderLines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const line of orderLines) {
        const unitPrice = priceByKey.get(lineKey(line));
        if (unitPrice == null) continue;
        await tx.update(orderItems).set({ unitPrice, lineTotal: unitPrice * line.quantity }).where(eq(orderItems.id, line.id));
      }

      const details = {
        buyerName: data.buyerName === undefined ? invoice.buyerName : data.buyerName || null,
        buyerPhone: data.buyerPhone === undefined ? invoice.buyerPhone : data.buyerPhone || null,
        guestEmail: data.guestEmail === undefined ? invoice.guestEmail : data.guestEmail || null,
        note: data.note === undefined ? invoice.note : data.note || null,
      };
      const [saved] = await tx.update(invoices).set({
        ...details,
        plan: data.plan,
        totalAmount: totals.totalAmount,
        amountDue,
        depositAmount,
        updatedAt: now,
      }).where(eq(invoices.id, invoice.id)).returning();
      await tx.update(orders).set({
        ...details,
        subtotal,
        totalAmount: totals.totalAmount,
        commissionRatePercent: feePolicy.commissionRatePercent,
        commissionAmount: totals.commissionAmount,
        flatFeeAmount: totals.flatFeeAmount,
        vendorPayoutAmount: totals.vendorPayoutAmount,
        feeChargedToCustomer: feePolicy.feeChargedToCustomer,
        international: feePolicy.international,
        amountDue: totals.totalAmount,
        updatedAt: now,
      }).where(eq(orders.id, order.id));
      return { saved, previousTotal: invoice.totalAmount };
    });

    after(() => logStoreActivity({
      storeId: loaded.invoice.storeId,
      actor: loaded.user,
      action: "invoice.update",
      summary: `Changed invoice ${loaded.invoice.invoiceNumber}: ${formatCurrency(updated.previousTotal)} -> ${formatCurrency(updated.saved.totalAmount)}`,
      targetType: "invoice",
      targetId: loaded.invoice.id,
      metadata: { from: updated.previousTotal, to: updated.saved.totalAmount, plan: updated.saved.plan },
    }));
    return NextResponse.json({ invoice: updated.saved });
  } catch (error) {
    if (error instanceof InvoiceEditError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const GET = withApiMonitoring(handleGet, { source: "vendor.invoice.detail" });
export const PATCH = withApiMonitoring(handlePatch, { source: "vendor.invoice.cancel" });
