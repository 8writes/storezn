import { NextResponse, after } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, cashMovements, orders, orderTenders, posHeldSales, staff, users } from "@/lib/db/schema.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { buildSessionSummary } from "@/lib/pos.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { validate, reviewSessionSchema } from "@/lib/validate.js";
import { logStoreActivity } from "@/lib/storeActivity.js";

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

  // Name every cash movement: who moved the money, and (for a sale/refund
  // movement) which order it was - so the Z report's cash-movement list
  // shows exactly what happened, not just a running total.
  const actorIds = [...new Set(movements.map((m) => m.createdBy).filter(Boolean))];
  const nameById = {};
  if (actorIds.length) {
    const [staffN, userN] = await Promise.all([
      db.select({ id: staff.id, f: staff.firstName, l: staff.lastName, e: staff.email }).from(staff).where(inArray(staff.id, actorIds)),
      db.select({ id: users.id, f: users.firstName, l: users.lastName, e: users.email }).from(users).where(inArray(users.id, actorIds)),
    ]);
    for (const r of [...staffN, ...userN]) nameById[r.id] = `${r.f || ""} ${r.l || ""}`.trim() || r.e;
  }
  const orderNoById = new Map(sessionOrders.map((o) => [o.id, o.orderNumber]));
  const movementsOut = movements.map((m) => ({
    ...m,
    by: nameById[m.createdBy] || null,
    orderNumber: m.orderId ? orderNoById.get(m.orderId) || null : null,
  }));

  return NextResponse.json({
    session: row.session,
    register: { id: row.register.id, name: row.register.name, branchId: row.register.branchId },
    summary,
    movements: movementsOut,
    orders: sessionOrders.map((o) => ({ ...o, paymentMethods: methodsByOrder.get(o.id) || [] })),
    heldSales: held,
  });
}

// Owner sign-off on a flagged close (forced / provisional / big variance).
// Owner-only - a staff member can't clear their own review flag.
export async function PATCH(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId, { owner: true });
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (row.session.status !== "closed") {
    return NextResponse.json({ error: "Only a closed shift can be reviewed" }, { status: 409 });
  }
  if (row.session.reviewStatus !== "pending") {
    return NextResponse.json({ error: "This shift isn't awaiting review" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const result = validate(reviewSessionSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [updated] = await db
    .update(posSessions)
    .set({
      reviewStatus: "approved",
      reviewedBy: ctx.user.id,
      reviewedAt: new Date(),
      reviewNote: result.data.note || null,
    })
    .where(eq(posSessions.id, id))
    .returning();

  after(() =>
    logStoreActivity({
      storeId,
      actor: ctx.user,
      branchId: row.register.branchId,
      action: "register.close.reviewed",
      summary:
        `Reviewed & approved the close of ${row.register.name}` +
        (Number(row.session.overShort) ? ` (${row.session.overShort > 0 ? "over" : "short"} ${formatKobo(Math.abs(row.session.overShort))})` : "") +
        (result.data.note ? ` · ${result.data.note}` : ""),
      targetType: "session",
      targetId: id,
      metadata: { note: result.data.note || null, overShortKobo: row.session.overShort },
    }),
  );

  return NextResponse.json({ session: updated });
}
