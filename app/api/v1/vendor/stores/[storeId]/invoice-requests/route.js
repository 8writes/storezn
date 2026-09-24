import { NextResponse, after } from "next/server";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { branches, invoiceRequestItems, invoiceRequests, productVariants, products, stores } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createInvoiceRequestSchema, validateCustomerFieldAnswers } from "../../../../../../../lib/validate.js";
import { snapshotCustomerFieldAnswers } from "../../../../../../../lib/customerFields.js";
import { logStoreActivity } from "../../../../../../../lib/storeActivity.js";
import { stockBranchForUser, STAFF_BRANCH_REQUIRED_MESSAGE } from "../../../../../../../lib/stockBranch.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { page, pageSize, limit, offset } = parsePagination(new URL(req.url).searchParams);
  const requestCondition = and(eq(invoiceRequests.storeId, storeId), inArray(invoiceRequests.status, ["new", "reviewing", "quoted"]));
  const [requests, [{ total }]] = await Promise.all([
    db.select().from(invoiceRequests).where(requestCondition).orderBy(desc(invoiceRequests.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(invoiceRequests).where(requestCondition),
  ]);
  const rows = requests.length ? await db.select().from(invoiceRequestItems).where(inArray(invoiceRequestItems.requestId, requests.map((request) => request.id))) : [];
  const itemsByRequest = new Map();
  for (const item of rows) itemsByRequest.set(item.requestId, [...(itemsByRequest.get(item.requestId) || []), item]);
  const full = requests.map((request) => ({ request, items: itemsByRequest.get(request.id) || [] }));
  const totalNumber = Number(total) || 0;
  return NextResponse.json({ requests: full, total: totalNumber, pagination: { page, pageSize, total: totalNumber, totalPages: Math.max(1, Math.ceil(totalNumber / pageSize)) } });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const result = validate(createInvoiceRequestSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const branchRows = await db.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  const branch = user.role === "staff"
    ? stockBranchForUser(branchRows, user)
    : branchRows.find((row) => row.id === result.data.branchId) || stockBranchForUser(branchRows, user);
  if (!branch) return NextResponse.json({ error: STAFF_BRANCH_REQUIRED_MESSAGE }, { status: 409 });
  const ids = [...new Set(result.data.items.map((item) => item.productId))];
  const variants = [...new Set(result.data.items.map((item) => item.variantId).filter(Boolean))];
  const [productsRows, variantsRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, ids), eq(products.isActive, true), isNull(products.suspendedAt))),
    variants.length ? db.select().from(productVariants).where(inArray(productVariants.id, variants)) : [],
  ]);
  const productById = new Map(productsRows.map((product) => [product.id, product]));
  const variantById = new Map(variantsRows.map((variant) => [variant.id, variant]));
  const rows = [];
  for (const item of result.data.items) {
    const product = productById.get(item.productId);
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (!product || product.saleMode !== "invoice_required" || (item.variantId && (!variant || variant.productId !== product.id || !variant.isActive))) return NextResponse.json({ error: "POS invoice requests only accept active invoice-required products" }, { status: 409 });
    const answers = validateCustomerFieldAnswers(product.customerFields, item.customerFields);
    if (!answers.ok) return NextResponse.json({ error: `${product.name}: ${answers.error}` }, { status: 400 });
    rows.push({ product, variant, item: { ...item, customerFields: snapshotCustomerFieldAnswers(product.customerFields, answers.data) } });
  }
  const requestNumber = `REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const [request] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(invoiceRequests).values({ storeId, branchId: branch.id, requestNumber, guestEmail: result.data.guestEmail, buyerName: result.data.buyerName, buyerPhone: result.data.buyerPhone, note: result.data.note || null, status: "new", createdBy: user.id }).returning();
    await tx.insert(invoiceRequestItems).values(rows.map(({ product, variant, item }) => ({ requestId: created.id, productId: product.id, variantId: variant?.id || null, productName: product.name, variantLabel: variant ? Object.entries(variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, quantity: item.quantity, customerFields: item.customerFields || {} })));
    return [created];
  });
  after(() => logStoreActivity({
    storeId,
    actor: user,
    action: "invoice.request.create",
    summary: `Created invoice request ${request.requestNumber}`,
    targetType: "invoice_request",
    targetId: request.id,
    metadata: { itemCount: rows.length, buyerName: request.buyerName || null, buyerPhone: request.buyerPhone || null },
  }));
  return NextResponse.json({ request }, { status: 201 });
}
