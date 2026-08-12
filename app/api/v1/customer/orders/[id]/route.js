import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { orders, orderItems, refundRequests, products, stores } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../../lib/auth.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({ order: orders, storeName: stores.name })
    .from(orders)
    .innerJoin(stores, eq(orders.storeId, stores.id))
    .where(eq(orders.id, id))
    .limit(1);
  const order = row ? { ...row.order, storeName: row.storeName } : null;
  if (!order || order.userId !== user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Left join, not inner - a deleted product must not hide its own order
  // item, it just loses its link (productSlug comes back null).
  const itemRows = await db
    .select({ item: orderItems, productSlug: products.slug })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, id));
  const items = itemRows.map(({ item, productSlug }) => ({ ...item, productSlug }));

  const [refundRequest] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);

  return NextResponse.json({ order, items, refundRequest: refundRequest || null });
}
