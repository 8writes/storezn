import { NextResponse, after } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../../../lib/db/index.js";
import { invoiceRequestItems, invoiceRequests, productVariants, products, users } from "../../../../../lib/db/schema.js";
import { getUser } from "../../../../../lib/auth.js";
import { resolveStoreByHost, isStoreLive } from "../../../../../lib/resolveStore.js";
import { validate, createInvoiceRequestSchema, validateCustomerFieldAnswers } from "../../../../../lib/validate.js";
import { snapshotCustomerFieldAnswers } from "../../../../../lib/customerFields.js";
import { sendPushToStore } from "../../../../../lib/push.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../lib/email/escapeHtml.js";
import { withApiMonitoring } from "../../../../../lib/apiMonitoring.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";

const requestNumber = () => `REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

async function handlePost(req) {
  const limit = await checkRateLimit(req, "invoice-request", { max: 20, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
  const store = await resolveStoreByHost(req.headers.get("host") || "");
  if (!store || !isStoreLive(store)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const result = validate(createInvoiceRequestSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const user = await getUser(req);
  const productIds = [...new Set(result.data.items.map((item) => item.productId))];
  const variantIds = [...new Set(result.data.items.map((item) => item.variantId).filter(Boolean))];
  const [productRows, variantRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, store.id), inArray(products.id, productIds), eq(products.isActive, true), isNull(products.suspendedAt))),
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [],
  ]);
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const variantById = new Map(variantRows.map((variant) => [variant.id, variant]));
  const items = [];
  for (const item of result.data.items) {
    const product = productById.get(item.productId);
    if (!product || product.saleMode !== "invoice_required") {
      return NextResponse.json({ error: "Every requested item must be an active invoice-required product" }, { status: 409 });
    }
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (item.variantId && (!variant || variant.productId !== product.id || !variant.isActive)) {
      return NextResponse.json({ error: `${product.name}: selected option is no longer available` }, { status: 409 });
    }
    const answers = validateCustomerFieldAnswers(product.customerFields, item.customerFields);
    if (!answers.ok) return NextResponse.json({ error: `${product.name}: ${answers.error}` }, { status: 400 });
    items.push({ product, variant, quantity: item.quantity, customerFields: snapshotCustomerFieldAnswers(product.customerFields, answers.data) });
  }

  const customerId = user?.role === "customer" && user.storeId === store.id ? user.id : null;
  if (!customerId && !result.data.guestEmail && !result.data.buyerPhone) {
    return NextResponse.json({ error: "Add an email or phone number so the seller can contact you" }, { status: 400 });
  }

  const [request] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(invoiceRequests).values({
      storeId: store.id,
      customerId,
      requestNumber: requestNumber(),
      guestEmail: result.data.guestEmail || (user?.role === "customer" ? user.email : null),
      buyerName: result.data.buyerName || null,
      buyerPhone: result.data.buyerPhone || null,
      note: result.data.note || null,
      status: "new",
    }).returning();
    await tx.insert(invoiceRequestItems).values(items.map((item) => ({
      requestId: created.id,
      productId: item.product.id,
      variantId: item.variant?.id || null,
      productName: item.product.name,
      variantLabel: item.variant ? Object.entries(item.variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null,
      quantity: item.quantity,
      customerFields: item.customerFields,
    })));
    return [created];
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  after(async () => {
    await sendPushToStore(store.id, {
      title: "New invoice request",
      body: `${request.requestNumber}: ${items.length} item${items.length === 1 ? "" : "s"} waiting for a quote.`,
      url: "/vendor/invoices",
    }).catch((error) => console.error("sendPushToStore failed (invoice request):", error));
    const [owner] = store.ownerId
      ? await db.select({ email: users.email, notify: users.emailNotificationsEnabled }).from(users).where(eq(users.id, store.ownerId)).limit(1)
      : [];
    if (owner?.email && owner.notify !== false) {
      await sendMail({
        to: owner.email,
        subject: `New invoice request - ${request.requestNumber}`,
        html: `<p>A customer requested a quote for <strong>${items.length} item${items.length === 1 ? "" : "s"}</strong>.</p><p><a href="${escapeHtml(`${appUrl}/vendor/invoices`)}">Review and create the invoice</a></p>`,
        fromName: store.name,
        brand: store,
        preheader: `${request.requestNumber} is waiting for a quote`,
      }).catch((error) => console.error("sendMail failed (invoice request vendor):", error));
    }
    if (request.guestEmail) {
      await sendMail({
        to: request.guestEmail,
        subject: `Quote request received - ${request.requestNumber}`,
        html: `<p><strong>${escapeHtml(store.name)}</strong> received your request and will contact you when your invoice is ready.</p><p>Request: <strong>${escapeHtml(request.requestNumber)}</strong></p>`,
        fromName: store.name,
        brand: store,
        preheader: `${store.name} received your quote request`,
      }).catch((error) => console.error("sendMail failed (invoice request customer):", error));
    }
  });

  return NextResponse.json({ request: { id: request.id, requestNumber: request.requestNumber, status: request.status } }, { status: 201 });
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.invoice_request.create" });
