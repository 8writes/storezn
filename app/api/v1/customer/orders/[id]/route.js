import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { orders, orderItems, refundRequests } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../../lib/auth.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order || order.userId !== user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const [refundRequest] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, id)).limit(1);

  return NextResponse.json({ order, items, refundRequest: refundRequest || null });
}
