import { NextResponse, after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { invoiceItems, invoiceRequestItems, invoiceRequests, invoices, orderItems, orders, platformSettings, productVariants, products, stores } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createInvoiceSchema } from "../../../../../../../lib/validate.js";
import { computeOrderTotals, generateOrderNumber } from "../../../../../../../lib/orders.js";
import { withApiMonitoring } from "../../../../../../../lib/apiMonitoring.js";
import { sendMail } from "../../../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../../../lib/email/escapeHtml.js";
import { formatCurrency } from "../../../../../../../lib/format.js";

const invoiceNumber = () => `INV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(invoices).where(eq(invoices.storeId, storeId)).orderBy(desc(invoices.createdAt)).limit(100);
  return NextResponse.json({ invoices: rows });
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
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds))),
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
    if (!requestItem || !product || product.saleMode !== "invoice_required" || (variant && variant.productId !== product.id)) {
      return NextResponse.json({ error: "Invoice items must come from the selected request" }, { status: 400 });
    }
    if (item.quantity > requestItem.quantity) return NextResponse.json({ error: `Quantity for ${product.name} exceeds the request` }, { status: 400 });
    lines.push({ product, variant, quantity: item.quantity, unitPrice: item.unitPrice, customerFields: item.customerFields || requestItem.customerFields || {} });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return NextResponse.json({ error: "Invoice total must be greater than zero" }, { status: 400 });
  const depositAmount = result.data.plan === "deposit" ? Number(result.data.depositAmount) : subtotal;
  if (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount > subtotal) return NextResponse.json({ error: "Deposit must be greater than zero and no more than the invoice total" }, { status: 400 });
  const settings = settingsRows[0];
  const commissionRatePercent = store.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? 5;
  const totals = computeOrderTotals({ subtotal, shippingFee: 0, commissionRatePercent, flatFee: settings?.defaultFlatFee ?? 0, feeChargedToCustomer: false, maxCommissionAmount: settings?.maxCommissionAmount });
  const invoiceId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = result.data.expiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const invoice = {
    id: invoiceId,
    storeId,
    requestId: request.id,
    orderId,
    invoiceNumber: invoiceNumber(),
    shareToken: `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`,
    status: "sent",
    plan: result.data.plan,
    totalAmount: subtotal,
    amountPaid: 0,
    amountDue: depositAmount,
    depositAmount: result.data.plan === "deposit" ? depositAmount : null,
    guestEmail: result.data.guestEmail || request.guestEmail,
    buyerName: request.buyerName,
    buyerPhone: request.buyerPhone,
    note: result.data.note || request.note,
    expiresAt,
    sentAt: now,
    createdBy: ["vendor", "super_admin"].includes(user.role) ? user.id : null,
  };
  const order = {
    id: orderId,
    storeId,
    orderNumber: generateOrderNumber(),
    guestEmail: request.guestEmail,
    buyerName: request.buyerName,
    buyerPhone: request.buyerPhone,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    shippingFee: 0,
    shippingFeeTBD: false,
    totalAmount: subtotal,
    commissionRatePercent,
    commissionAmount: totals.commissionAmount,
    flatFeeAmount: totals.flatFeeAmount,
    vendorPayoutAmount: totals.vendorPayoutAmount,
    feeChargedToCustomer: false,
    note: invoice.note,
    isOffline: false,
    channel: "online",
    amountPaid: 0,
    amountDue: subtotal,
    invoiceId,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    await tx.insert(invoices).values({ ...invoice, orderId: null });
    await tx.insert(orders).values(order);
    await tx.update(invoices).set({ orderId }).where(eq(invoices.id, invoiceId));
    await tx.insert(invoiceItems).values(lines.map((line) => ({ invoiceId, productId: line.product.id, variantId: line.variant?.id || null, productName: line.product.name, variantLabel: line.variant ? Object.entries(line.variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.unitPrice * line.quantity, customerFields: line.customerFields })));
    await tx.insert(orderItems).values(lines.map((line) => ({ orderId, productId: line.product.id, variantId: line.variant?.id || null, productName: line.product.name, productImage: line.product.images?.[0] || null, variantLabel: line.variant ? Object.entries(line.variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.unitPrice * line.quantity, customerFields: line.customerFields })));
    await tx.update(invoiceRequests).set({ status: "converted", convertedInvoiceId: invoiceId, updatedAt: now }).where(eq(invoiceRequests.id, request.id));
  });
  const paymentEmail = invoice.guestEmail;
  if (paymentEmail) {
    const link = `${new URL(req.url).origin}/invoice/${invoice.shareToken}`;
    after(() => sendMail({
      to: paymentEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${store.name}`,
      html: `<p>Hello${invoice.buyerName ? ` ${escapeHtml(invoice.buyerName)}` : ""},</p><p>Your invoice from <strong>${escapeHtml(store.name)}</strong> is ready.</p><p>Total: <strong>${escapeHtml(formatCurrency(invoice.totalAmount))}</strong><br/>Due now: <strong>${escapeHtml(formatCurrency(invoice.amountDue))}</strong></p><p><a href="${escapeHtml(link)}">View and pay invoice</a></p>`,
      fromName: store.name,
      brand: store,
      preheader: `Invoice ${invoice.invoiceNumber} is ready`,
    }).catch((error) => console.error("sendMail failed (invoice):", error)));
  }
  return NextResponse.json({ invoice, order }, { status: 201 });
}

export const POST = withApiMonitoring(handlePost, { source: "vendor.invoice.create" });
