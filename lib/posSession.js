import { eq, sql } from "drizzle-orm";
import { cashMovements, orders, orderTenders, posSessions } from "./db/schema.js";
import { toKobo } from "./money.js";
import { buildSessionSummary } from "./pos.js";

export async function lockPosSession(tx, sessionId) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`);
  const [session] = await tx.select().from(posSessions).where(eq(posSessions.id, sessionId)).limit(1);
  return session || null;
}

export async function buildPosSessionSummary(tx, session) {
  const [movements, sessionOrders, tenders] = await Promise.all([
    tx.select().from(cashMovements).where(eq(cashMovements.sessionId, session.id)),
    tx
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        discountAmount: orders.discountAmount,
        originalOrderId: orders.originalOrderId,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.posSessionId, session.id)),
    tx.select().from(orderTenders).where(eq(orderTenders.sessionId, session.id)),
  ]);
  return buildSessionSummary({
    session,
    orders: sessionOrders.map((order) => ({
      ...order,
      totalAmount: toKobo(order.totalAmount),
      discountAmount: order.discountAmount || 0,
    })),
    tenders,
    movements,
  });
}

export async function reconcileClosedPosSession(tx, session, { syncedSales = 1 } = {}) {
  const summary = await buildPosSessionSummary(tx, session);
  const pendingSyncCount = Math.max(0, Number(session.pendingSyncCount || 0) - syncedSales);
  const expectedCash = summary.drawer.expectedCash;
  const countedCash = Number(session.countedCash ?? expectedCash);
  const overShort = countedCash - expectedCash;
  const provisional = pendingSyncCount > 0;
  // A late sale changes an already-issued Z report. Always send that close
  // back to the owner for review, even when the closing device did not know
  // another device still had queued sales.
  const reviewStatus = syncedSales > 0 ? "pending" : session.reviewStatus;
  const zReport = {
    ...summary,
    countedCash,
    expectedCash,
    overShort,
    closedBy: session.closedBy,
    closeMethod: session.closeMethod,
    provisional,
    pendingSyncCount,
    reviewStatus,
  };
  const [updated] = await tx
    .update(posSessions)
    .set({ expectedCash, overShort, provisional, pendingSyncCount, reviewStatus, zReport })
    .where(eq(posSessions.id, session.id))
    .returning();
  return updated;
}
