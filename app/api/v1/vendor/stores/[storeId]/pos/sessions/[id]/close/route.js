import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, cashMovements, orders, orderTenders, posHeldSales } from "@/lib/db/schema.js";
import { validate, closeSessionSchema } from "@/lib/validate.js";
import { toKobo } from "@/lib/money.js";
import { buildSessionSummary } from "@/lib/pos.js";
import { posContext, loadSession } from "@/lib/posAccess.js";

// The Z report: count the drawer, freeze the figures, write the
// immutable snapshot, close the session. A register can't open a fresh
// session until this runs (uq_pos_sessions_open_register), and any held
// sales still parked must be cleared first.
export async function POST(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (row.session.status !== "open") {
    return NextResponse.json({ error: "This session is already closed" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const result = validate(closeSessionSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [held] = await db.select({ id: posHeldSales.id }).from(posHeldSales).where(eq(posHeldSales.sessionId, id)).limit(1);
  if (held) {
    return NextResponse.json(
      { error: "Recall and finish (or discard) every held sale before closing the register" },
      { status: 409 },
    );
  }

  const [movements, sessionOrders] = await Promise.all([
    db.select().from(cashMovements).where(eq(cashMovements.sessionId, id)),
    db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        discountAmount: orders.discountAmount,
        originalOrderId: orders.originalOrderId,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.posSessionId, id)),
  ]);
  const tenders = await db.select().from(orderTenders).where(eq(orderTenders.sessionId, id));

  const summary = buildSessionSummary({
    session: row.session,
    orders: sessionOrders.map((o) => ({ ...o, totalAmount: toKobo(o.totalAmount), discountAmount: o.discountAmount || 0 })),
    tenders,
    movements,
  });

  const countedCash = toKobo(result.data.countedCash);
  const expectedCash = summary.drawer.expectedCash;
  const overShort = countedCash - expectedCash;

  const [closed] = await db
    .update(posSessions)
    .set({
      status: "closed",
      closedBy: ctx.user.id,
      closedAt: new Date(),
      countedCash,
      expectedCash,
      overShort,
      zReport: { ...summary, countedCash, expectedCash, overShort, closedBy: ctx.user.id },
    })
    .where(eq(posSessions.id, id))
    .returning();

  return NextResponse.json({ session: closed, zReport: closed.zReport });
}
