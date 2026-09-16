import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { branches, orderItems, orders, products, stores, storeActivityLogs } from "@/lib/db/schema.js";
import { getUser, canManageStore } from "@/lib/auth.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId, id } = await params;
  const [[store], [product]] = await Promise.all([
    db.select().from(stores).where(eq(stores.id, storeId)).limit(1),
    db.select({ id: products.id, name: products.name, sku: products.sku }).from(products)
      .where(and(eq(products.id, id), eq(products.storeId, storeId))).limit(1),
  ]);
  if (!store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const saleConditions = [eq(orderItems.productId, id), eq(orders.storeId, storeId), eq(orders.paymentStatus, "paid")];
  if (user.role === "staff" && user.branchId) saleConditions.push(eq(orders.branchId, user.branchId));
  const [changes, sales] = await Promise.all([
    db.select().from(storeActivityLogs)
      .where(and(eq(storeActivityLogs.storeId, storeId), eq(storeActivityLogs.targetType, "product"), eq(storeActivityLogs.targetId, id)))
      .orderBy(desc(storeActivityLogs.createdAt)).limit(200),
    db.select({
      id: orderItems.id, orderId: orders.id, orderNumber: orders.orderNumber,
      orderStatus: orders.status, channel: orders.channel, soldAt: orders.paidAt,
      branchId: orders.branchId, branchName: branches.name, variantLabel: orderItems.variantLabel,
      quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, lineTotal: orderItems.lineTotal,
      originalUnitPrice: orderItems.originalUnitPrice, priceOverridden: orderItems.priceOverridden,
      lineDiscount: orderItems.lineDiscount, isReturn: orders.originalOrderId,
    }).from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(branches, eq(branches.id, orders.branchId))
      .where(and(...saleConditions))
      .orderBy(desc(orders.paidAt)),
  ]);

  return NextResponse.json({ product, changes, sales });
}
