import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, cashMovements, orders, orderTenders, posHeldSales } from "@/lib/db/schema.js";
import { toKobo } from "@/lib/money.js";
import { buildSessionSummary } from "@/lib/pos.js";
import { posContext, loadSession } from "@/lib/posAccess.js";

// Session detail + a live X-report summary. Polled by the sell screen for
// the session bar, and rendered in full on the session/Z-report view.
export async function GET(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const [movements, sessionOrders, held] = await Promise.all([
    db.select().from(cashMovements).where(eq(cashMovements.sessionId, id)).orderBy(cashMovements.createdAt),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        totalAmount: orders.totalAmount,
        discountAmount: orders.discountAmount,
        originalOrderId: orders.originalOrderId,
        buyerName: orders.buyerName,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.posSessionId, id))
      .orderBy(desc(orders.createdAt)),
    db.select().from(posHeldSales).where(eq(posHeldSales.sessionId, id)).orderBy(desc(posHeldSales.createdAt)),
  ]);

  const orderIds = sessionOrders.map((o) => o.id);
  const tenders = orderIds.length
    ? await db.select().from(orderTenders).where(eq(orderTenders.sessionId, id))
    : [];

  // orders.totalAmount is naira (real); the summary works in kobo.
  const summary = buildSessionSummary({
    session: row.session,
    orders: sessionOrders.map((o) => ({
      ...o,
      totalAmount: toKobo(o.totalAmount),
      discountAmount: o.discountAmount || 0,
    })),
    tenders,
    movements,
  });

  // Payment method(s) per order, so the Sales list can show "paid by".
  const methodsByOrder = new Map();
  for (const t of tenders) {
    const label = t.provider ? `${t.method}:${t.provider}` : t.method;
    const arr = methodsByOrder.get(t.orderId) || [];
    if (!arr.includes(label)) arr.push(label);
    methodsByOrder.set(t.orderId, arr);
  }

  return NextResponse.json({
    session: row.session,
    register: { id: row.register.id, name: row.register.name, branchId: row.register.branchId },
    summary,
    movements,
    orders: sessionOrders.map((o) => ({ ...o, paymentMethods: methodsByOrder.get(o.id) || [] })),
    heldSales: held,
  });
}
