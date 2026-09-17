import { NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { branches, orderItems, orders, products, stores, storeActivityLogs } from "@/lib/db/schema.js";
import { getUser, isStoreOwner } from "@/lib/auth.js";

const PAGE_SIZE = 20;

function pageNumber(value) {
  return Math.max(1, Number.parseInt(value, 10) || 1);
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId, id } = await params;
  const [[store], [product]] = await Promise.all([
    db.select().from(stores).where(eq(stores.id, storeId)).limit(1),
    db.select({ id: products.id, name: products.name, sku: products.sku }).from(products)
      .where(and(eq(products.id, id), eq(products.storeId, storeId))).limit(1),
  ]);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Only the store owner can view product history" }, { status: 403 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const changesPage = pageNumber(sp.get("changesPage"));
  const salesPage = pageNumber(sp.get("salesPage"));
  const changeConditions = and(eq(storeActivityLogs.storeId, storeId), eq(storeActivityLogs.targetType, "product"), eq(storeActivityLogs.targetId, id));
  const saleConditions = [eq(orderItems.productId, id), eq(orders.storeId, storeId), eq(orders.paymentStatus, "paid")];
  const [changes, sales, [{ changesTotal }], [{ salesTotal }]] = await Promise.all([
    db.select().from(storeActivityLogs)
      .where(changeConditions)
      .orderBy(desc(storeActivityLogs.createdAt)).limit(PAGE_SIZE).offset((changesPage - 1) * PAGE_SIZE),
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
      .orderBy(desc(orders.paidAt)).limit(PAGE_SIZE).offset((salesPage - 1) * PAGE_SIZE),
    db.select({ changesTotal: count() }).from(storeActivityLogs).where(changeConditions),
    db.select({ salesTotal: count() }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(...saleConditions)),
  ]);

  return NextResponse.json({
    product,
    changes,
    sales,
    changesPagination: { page: changesPage, pageSize: PAGE_SIZE, total: changesTotal, totalPages: Math.max(1, Math.ceil(changesTotal / PAGE_SIZE)) },
    salesPagination: { page: salesPage, pageSize: PAGE_SIZE, total: salesTotal, totalPages: Math.max(1, Math.ceil(salesTotal / PAGE_SIZE)) },
  });
}
