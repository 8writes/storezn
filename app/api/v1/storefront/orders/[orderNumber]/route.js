import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { orders, orderItems } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../../lib/auth.js";
import { resolveStoreByHost } from "../../../../../../lib/resolveStore.js";

// Guests prove ownership with the order number + the email they checked
// out with; logged-in customers just need to own the order.
export async function GET(req, { params }) {
  const { orderNumber } = await params;
  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.storeId, store.id)))
    .limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const user = await getUser(req);
  if (order.userId) {
    if (!user || user.id !== order.userId) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  } else {
    const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
    if (!email || email !== order.guestEmail?.toLowerCase()) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return NextResponse.json({ order, items });
}
