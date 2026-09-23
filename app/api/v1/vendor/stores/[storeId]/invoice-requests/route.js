import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { invoiceRequestItems, invoiceRequests, productVariants, products, stores } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createInvoiceRequestSchema } from "../../../../../../../lib/validate.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await db.select().from(invoiceRequests).where(eq(invoiceRequests.storeId, storeId)).orderBy(desc(invoiceRequests.createdAt)).limit(100);
  const rows = requests.length ? await db.select().from(invoiceRequestItems).where(inArray(invoiceRequestItems.requestId, requests.map((request) => request.id))) : [];
  const itemsByRequest = new Map();
  for (const item of rows) itemsByRequest.set(item.requestId, [...(itemsByRequest.get(item.requestId) || []), item]);
  const full = requests.map((request) => ({ request, items: itemsByRequest.get(request.id) || [] }));
  return NextResponse.json({ requests: full });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const result = validate(createInvoiceRequestSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const ids = [...new Set(result.data.items.map((item) => item.productId))];
  const variants = [...new Set(result.data.items.map((item) => item.variantId).filter(Boolean))];
  const [productsRows, variantsRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, ids), eq(products.isActive, true))),
    variants.length ? db.select().from(productVariants).where(inArray(productVariants.id, variants)) : [],
  ]);
  const productById = new Map(productsRows.map((product) => [product.id, product]));
  const variantById = new Map(variantsRows.map((variant) => [variant.id, variant]));
  const rows = [];
  for (const item of result.data.items) {
    const product = productById.get(item.productId);
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (!product || product.saleMode !== "invoice_required" || (item.variantId && (!variant || variant.productId !== product.id))) return NextResponse.json({ error: "POS invoice requests only accept invoice-required products" }, { status: 409 });
    rows.push({ product, variant, item });
  }
  const requestNumber = `REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const [request] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(invoiceRequests).values({ storeId, requestNumber, buyerName: result.data.buyerName || null, buyerPhone: result.data.buyerPhone || null, note: result.data.note || null, status: "new", createdBy: ["vendor", "super_admin"].includes(user.role) ? user.id : null }).returning();
    await tx.insert(invoiceRequestItems).values(rows.map(({ product, variant, item }) => ({ requestId: created.id, productId: product.id, variantId: variant?.id || null, productName: product.name, variantLabel: variant ? Object.entries(variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(", ") : null, quantity: item.quantity, customerFields: item.customerFields || {} })));
    return [created];
  });
  return NextResponse.json({ request }, { status: 201 });
}
