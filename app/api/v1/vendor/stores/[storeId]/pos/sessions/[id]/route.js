import { NextResponse, after } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, cashMovements, orders, orderTenders, posHeldSales, staff, users } from "@/lib/db/schema.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { buildSessionSummary } from "@/lib/pos.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { validate, reviewSessionSchema } from "@/lib/validate.js";
import { logStoreActivity } from "@/lib/storeActivity.js";

const LIST_PAGE = 20;

// Resolve cash-movement actor ids (staff or users) to display names.
async function resolveNames(ids) {
  const nameById = {};
  if (!ids.length) return nameById;
  const [staffN, userN] = await Promise.all([
    db.select({ id: staff.id, f: staff.firstName, l: staff.lastName, e: staff.email }).from(staff).where(inArray(staff.id, ids)),
    db.select({ id: users.id, f: users.firstName, l: users.lastName, e: users.email }).from(users).where(inArray(users.id, ids)),
  ]);
  for (const r of [...staffN, ...userN]) nameById[r.id] = `${r.f || ""} ${r.l || ""}`.trim() || r.e;
  return nameById;
}

// method(:provider) label per order, so a Sales row can show "paid by".
async function methodsFor(orderIds) {
  const map = new Map();
  if (!orderIds.length) return map;
  const tenders = await db.select().from(orderTenders).where(inArray(orderTenders.orderId, orderIds));
  for (const t of tenders) {
    const label = t.provider ? `${t.method}:${t.provider}` : t.method;
    const arr = map.get(t.orderId) || [];
    if (!arr.includes(label)) arr.push(label);
    map.set(t.orderId, arr);
  }
  return map;
}

// Session detail + a live X-report summary. Polled by the sell screen for
// the session bar, and rendered in full on the session/Z-report view.
//
// ?movementsPage=N or ?ordersPage=N returns just that one paginated list
// (20/page, newest first) for the session page's "load more" - the heavy
// summary is skipped.
export async function GET(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;

  // ---- "load more" for the Cash movements list ----
  if (sp.get("movementsPage")) {
    const page = Math.max(1, parseInt(sp.get("movementsPage"), 10) || 1);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(cashMovements).where(eq(cashMovements.sessionId, id)).orderBy(desc(cashMovements.createdAt)).limit(LIST_PAGE).offset((page - 1) * LIST_PAGE),
      db.select({ total: count() }).from(cashMovements).where(eq(cashMovements.sessionId, id)),
    ]);
    const nameById = await resolveNames([...new Set(rows.map((m) => m.createdBy).filter(Boolean))]);
    const ordIds = [...new Set(rows.map((m) => m.orderId).filter(Boolean))];
    const orderNoById = ordIds.length
      ? new Map((await db.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(inArray(orders.id, ordIds))).map((o) => [o.id, o.orderNumber]))
      : new Map();
    return NextResponse.json({
      movements: rows.map((m) => ({ ...m, by: nameById[m.createdBy] || null, orderNumber: m.orderId ? orderNoById.get(m.orderId) || null : null })),
      pagination: { page, pageSize: LIST_PAGE, total, totalPages: Math.max(1, Math.ceil(total / LIST_PAGE)) },
    });
  }

  // ---- "load more" for the Sales list ----
  if (sp.get("ordersPage")) {
    const page = Math.max(1, parseInt(sp.get("ordersPage"), 10) || 1);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ id: orders.id, orderNumber: orders.orderNumber, totalAmount: orders.totalAmount, originalOrderId: orders.originalOrderId, createdAt: orders.createdAt })
        .from(orders)
        .where(eq(orders.posSessionId, id))
        .orderBy(desc(orders.createdAt))
        .limit(LIST_PAGE)
        .offset((page - 1) * LIST_PAGE),
      db.select({ total: count() }).from(orders).where(eq(orders.posSessionId, id)),
    ]);
    const methods = await methodsFor(rows.map((o) => o.id));
    return NextResponse.json({
      orders: rows.map((o) => ({ ...o, paymentMethods: methods.get(o.id) || [] })),
      pagination: { page, pageSize: LIST_PAGE, total, totalPages: Math.max(1, Math.ceil(total / LIST_PAGE)) },
    });
  }

  // ---- full detail: summary (all data) + first page of each list ----
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
  const tenders = orderIds.length ? await db.select().from(orderTenders).where(eq(orderTenders.sessionId, id)) : [];

  // orders.totalAmount is naira (real); the summary works in kobo.
  const summary = buildSessionSummary({
    session: row.session,
    orders: sessionOrders.map((o) => ({ ...o, totalAmount: toKobo(o.totalAmount), discountAmount: o.discountAmount || 0 })),
    tenders,
    movements,
  });

  const methodsByOrder = new Map();
  for (const t of tenders) {
    const label = t.provider ? `${t.method}:${t.provider}` : t.method;
    const arr = methodsByOrder.get(t.orderId) || [];
    if (!arr.includes(label)) arr.push(label);
    methodsByOrder.set(t.orderId, arr);
  }

  const nameById = await resolveNames([...new Set(movements.map((m) => m.createdBy).filter(Boolean))]);
  const orderNoById = new Map(sessionOrders.map((o) => [o.id, o.orderNumber]));

  // Name the itemised cash events so the Z report's own mini-list stays
  // informative even though the full ledger below is now paginated.
  summary.cashEvents = (summary.cashEvents || []).map((m) => ({
    ...m,
    by: nameById[m.createdBy] || null,
    orderNumber: m.orderId ? orderNoById.get(m.orderId) || null : null,
  }));

  // Newest first for the paginated list; only the first page is sent here.
  const movementsDesc = [...movements].reverse();
  const movementsOut = movementsDesc.slice(0, LIST_PAGE).map((m) => ({
    ...m,
    by: nameById[m.createdBy] || null,
    orderNumber: m.orderId ? orderNoById.get(m.orderId) || null : null,
  }));

  return NextResponse.json({
    session: row.session,
    register: { id: row.register.id, name: row.register.name, branchId: row.register.branchId },
    summary,
    movements: movementsOut,
    movementsTotal: movements.length,
    orders: sessionOrders.slice(0, LIST_PAGE).map((o) => ({ ...o, paymentMethods: methodsByOrder.get(o.id) || [] })),
    ordersTotal: sessionOrders.length,
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
