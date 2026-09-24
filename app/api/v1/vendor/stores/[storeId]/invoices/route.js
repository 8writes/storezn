import { NextResponse, after } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { invoiceInventoryHolds, invoiceItems, invoiceRequestItems, invoiceRequests, invoices, orderItems, orders, platformSettings, productVariants, products, stores } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createInvoiceSchema } from "../../../../../../../lib/validate.js";
import { computeOrderTotals, generateOrderNumber } from "../../../../../../../lib/orders.js";
import { withApiMonitoring } from "../../../../../../../lib/apiMonitoring.js";
import { sendMail } from "../../../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../../../lib/email/escapeHtml.js";
import { formatCurrency } from "../../../../../../../lib/format.js";
import { OutOfStockError, resolveFulfillingBranch, reserveStock } from "../../../../../../../lib/inventory.js";
import { logStoreActivity } from "../../../../../../../lib/storeActivity.js";
import { buildPublicAppUrl } from "../../../../../../../lib/requestUrl.js";

const invoiceNumber = () => `INV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

class InvoiceConflictError extends Error {}

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, settingsRows] = await Promise.all([
    db
      .select({ invoice: invoices, order: orders })
      .from(invoices)
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .where(eq(invoices.storeId, storeId))
      .orderBy(desc(invoices.createdAt))
      .limit(100),
    db.select().from(platformSettings).limit(1),
  ]);
  const settings = settingsRows[0];
  return NextResponse.json({
    invoices: rows.map(({ invoice, order }) => ({
      ...invoice,
      subtotal: order?.subtotal ?? invoice.totalAmount,
      commissionRatePercent: order?.commissionRatePercent ?? 0,
      commissionAmount: order?.commissionAmount ?? 0,
      flatFeeAmount: order?.flatFeeAmount ?? 0,
      vendorPayoutAmount: order?.vendorPayoutAmount ?? invoice.totalAmount,
      feeChargedToCustomer: order?.feeChargedToCustomer ?? false,
    })),
    feePolicy: {
      commissionRatePercent: store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5,
      flatFee: settings?.defaultFlatFee ?? 0,
      maxCommissionAmount: settings?.maxCommissionAmount ?? null,
      feeChargedToCustomer: store.feeChargedToCustomer ?? false,
    },
  });
}

async function handlePost(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const result = validate(createInvoiceSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [request] = await db.select().from(invoiceRequests).where(and(eq(invoiceRequests.id, result.data.requestId), eq(invoiceRequests.storeId, storeId))).limit(1);
  if (!request) return NextResponse.json({ error: "Invoice request not found" }, { status: 404 });
  if (["cancelled", "expired", "converted"].includes(request.status)) return NextResponse.json({ error: "This request is no longer open" }, { status: 409 });
  const requestedItems = await db.select().from(invoiceRequestItems).where(eq(invoiceRequestItems.requestId, request.id));
  const requestItemByKey = new Map(requestedItems.map((item) => [`${item.productId}:${item.variantId || ""}`, item]));
  const productIds = [...new Set(result.data.items.map((item) => item.productId))];
  const variantIds = [...new Set(result.data.items.map((item) => item.variantId).filter(Boolean))];
  const [productRows, variantRows, settingsRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds), eq(products.isActive, true), isNull(products.suspendedAt))),
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [],
    db.select().from(platformSettings).limit(1),
  ]);
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const variantById = new Map(variantRows.map((variant) => [variant.id, variant]));
  const lines = [];
  for (const item of result.data.items) {
    const requestItem = requestItemByKey.get(`${item.productId}:${item.variantId || ""}`);
    const product = productById.get(item.productId);
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (!requestItem || !product || product.saleMode !== "invoice_required" || (item.variantId && (!variant || variant.productId !== product.id || !variant.isActive))) {
      return NextResponse.json({ error: "Invoice items must come from the selected request" }, { status: 400 });
    }
    if (item.quantity > requestItem.quantity) return NextResponse.json({ error: `Quantity for ${product.name} exceeds the request` }, { status: 400 });
    lines.push({ product, variant, quantity: item.quantity, unitPrice: item.unitPrice, customerFields: requestItem.customerFields || {} });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return NextResponse.json({ error: "Invoice total must be greater than zero" }, { status: 400 });
  const settings = settingsRows[0];
  const commissionRatePercent = store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5;
  const feeChargedToCustomer = store.feeChargedToCustomer ?? false;
  const totals = computeOrderTotals({ subtotal, shippingFee: 0, commissionRatePercent, flatFee: settings?.defaultFlatFee ?? 0, feeChargedToCustomer, maxCommissionAmount: settings?.maxCommissionAmount });
  const configuredFlatFee = Math.max(0, Number(settings?.defaultFlatFee) || 0);
  if (!feeChargedToCustomer && configuredFlatFee > totals.flatFeeAmount + 0.001) {
    return NextResponse.json(
      { error: "This invoice total is too low for the store to absorb the full platform fee. Increase the quoted price before creating the invoice." },
      { status: 422 },
    );
  }
  const depositAmount = result.data.plan === "deposit" ? Math.round(totals.totalAmount * 50) / 100 : totals.totalAmount;
  const invoiceId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = result.data.expiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (expiresAt.getTime() <= now.getTime()) return NextResponse.json({ error: "Invoice expiry must be in the future" }, { status: 400 });
  if (expiresAt.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Invoice expiry cannot be more than 90 days away" }, { status: 400 });
  const physicalLines = lines.filter((line) => line.product.productType === "physical");
  const invoice = {
    id: invoiceId,
    storeId,
    requestId: request.id,
    orderId,
    invoiceNumber: invoiceNumber(),
    shareToken: `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`,
    status: "sent",
    plan: result.data.plan,
    totalAmount: totals.totalAmount,
    amountPaid: 0,
    amountDue: depositAmount,
    depositAmount: result.data.plan === "deposit" ? depositAmount : null,
    guestEmail: result.data.guestEmail || request.guestEmail,
    buyerName: request.buyerName,
    buyerPhone: request.buyerPhone,
    note: result.data.note || request.note,
    expiresAt,
    sentAt: now,
    createdBy: user.id,
  };
  const order = {
    id: orderId,
    storeId,
    userId: request.customerId || null,
    orderNumber: generateOrderNumber(),
    guestEmail: invoice.guestEmail,
    buyerName: request.buyerName,
    buyerPhone: request.buyerPhone,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    shippingFee: 0,
    shippingFeeTBD: false,
    totalAmount: totals.totalAmount,
    commissionRatePercent,
    commissionAmount: totals.commissionAmount,
    flatFeeAmount: totals.flatFeeAmount,
    vendorPayoutAmount: totals.vendorPayoutAmount,
    feeChargedToCustomer,
    note: invoice.note,
    isOffline: !!request.createdBy,
    channel: request.createdBy ? "manual" : "online",
    branchId: request.branchId || null,
    amountPaid: 0,
    amountDue: totals.totalAmount,
    invoiceId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.transaction(async (tx) => {
      const [lockedRequest] = await tx.select({ status: invoiceRequests.status }).from(invoiceRequests).where(and(eq(invoiceRequests.id, request.id), eq(invoiceRequests.storeId, storeId))).for("update").limit(1);
      if (!lockedRequest || ["cancelled", "expired", "converted"].includes(lockedRequest.status)) throw new InvoiceConflictError("This request is no longer open");

      // The invoice must exist before its inventory holds because the hold
      // rows have a foreign key to invoices.id.
      await tx.insert(invoices).values({ ...invoice, orderId: null });
      let branchId = null;
      if (physicalLines.length > 0) {
        branchId = await resolveFulfillingBranch(tx, storeId, physicalLines.map((line) => ({
          productId: line.product.id,
          variantId: line.variant?.id || null,
          quantity: line.quantity,
          productName: line.product.name,
        })), { preferredBranchId: request.branchId || undefined });
        await reserveStock(tx, physicalLines.map((line) => ({
          productId: line.product.id,
          variantId: line.variant?.id || null,
          quantity: line.quantity,
          productName: line.product.name,
          branchId,
        })));
        await tx.insert(invoiceInventoryHolds).values(physicalLines.map((line) => ({
          invoiceId,
          productId: line.product.id,
          variantId: line.variant?.id || null,
          branchId,
          quantity: line.quantity,
        })));
      }
      order.branchId = branchId;
      await tx.insert(orders).values(order);
      await tx.update(invoices).set({ orderId }).where(eq(invoices.id, invoiceId));
      await tx.insert(invoiceItems).values(lines.map((line) => ({ invoiceId, productId: line.product.id, variantId: line.variant?.id || null, productName: line.product.name, variantLabel: line.variant ? Object.entries(line.variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.unitPrice * line.quantity, customerFields: line.customerFields })));
      await tx.insert(orderItems).values(lines.map((line) => ({ orderId, productId: line.product.id, variantId: line.variant?.id || null, productName: line.product.name, productImage: line.product.images?.[0] || null, variantLabel: line.variant ? Object.entries(line.variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.unitPrice * line.quantity, customerFields: line.customerFields })));
      await tx.update(invoiceRequests).set({ status: "converted", convertedInvoiceId: invoiceId, updatedAt: now }).where(eq(invoiceRequests.id, request.id));
    });
  } catch (error) {
    if (error instanceof InvoiceConflictError || (error?.code === "23505" && error?.constraint === "uq_invoices_request_id")) return NextResponse.json({ error: "This request has already been converted" }, { status: 409 });
    if (error instanceof OutOfStockError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  const paymentEmail = invoice.guestEmail;
  if (paymentEmail) {
    const link = buildPublicAppUrl(req, `/invoice/${invoice.shareToken}`);
    after(() => sendMail({
      to: paymentEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${store.name}`,
      html: `<p>Hello${invoice.buyerName ? ` ${escapeHtml(invoice.buyerName)}` : ""},</p><p>Your invoice from <strong>${escapeHtml(store.name)}</strong> is ready.</p><p>Total: <strong>${escapeHtml(formatCurrency(invoice.totalAmount))}</strong><br/>Due now: <strong>${escapeHtml(formatCurrency(invoice.amountDue))}</strong></p><p><a href="${escapeHtml(link)}">View and pay invoice</a></p>`,
      fromName: store.name,
      brand: store,
      preheader: `Invoice ${invoice.invoiceNumber} is ready`,
    }).catch((error) => console.error("sendMail failed (invoice):", error)));
  }
  after(() => logStoreActivity({
    storeId,
    actor: user,
    action: "invoice.create",
    summary: `Created invoice ${invoice.invoiceNumber} for ${formatCurrency(invoice.totalAmount)}`,
    targetType: "invoice",
    targetId: invoice.id,
    metadata: { requestId: request.id, orderId, plan: invoice.plan, totalAmount: invoice.totalAmount, amountDue: invoice.amountDue },
  }));
  return NextResponse.json({
    invoice: {
      ...invoice,
      subtotal,
      commissionRatePercent,
      commissionAmount: totals.commissionAmount,
      flatFeeAmount: totals.flatFeeAmount,
      vendorPayoutAmount: totals.vendorPayoutAmount,
      feeChargedToCustomer,
    },
    order,
  }, { status: 201 });
}

export const POST = withApiMonitoring(handlePost, { source: "vendor.invoice.create" });
