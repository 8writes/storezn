import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import {
  stores,
  staff,
  users,
  orders,
  orderItems,
  orderTenders,
  products,
  categories,
  customers,
  branches,
  posSessions,
  posRegisters,
  storeActivityLogs,
} from "../../../../../../../../lib/db/schema.js";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { toNaira } from "../../../../../../../../lib/money.js";

// A calendar-month business report for the store owner. Owner-only.
// ?month=YYYY-MM (defaults to the current month). All money in naira.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) {
    return NextResponse.json({ error: "Only the store owner can generate reports" }, { status: 403 });
  }

  const monthParam = new URL(req.url).searchParams.get("month") || "";
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
  if (month < 0 || month > 11) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = start.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });

  const inMonth = and(eq(orders.storeId, storeId), gte(orders.createdAt, start), lt(orders.createdAt, end));
  // A real sale: paid, not a refund/return line.
  const isSale = sql`${orders.paymentStatus} = 'paid' and ${orders.originalOrderId} is null and ${orders.totalAmount} >= 0`;
  const isReturn = sql`${orders.originalOrderId} is not null`;

  const [
    [totals],
    byChannel,
    byBranch,
    byTender,
    topByRevenue,
    topByQty,
    byCategory,
    byCashier,
    [newCust],
    [cashVar],
    activityCounts,
  ] = await Promise.all([
    db
      .select({
        salesCount: sql`count(*) filter (where ${isSale})`.mapWith(Number),
        gross: sql`coalesce(sum(${orders.totalAmount}) filter (where ${isSale}), 0)`.mapWith(Number),
        returnsCount: sql`count(*) filter (where ${isReturn})`.mapWith(Number),
        returnsTotal: sql`coalesce(sum(${orders.totalAmount}) filter (where ${isReturn}), 0)`.mapWith(Number),
        discountsKobo: sql`coalesce(sum(${orders.discountAmount}) filter (where ${isSale}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(inMonth),
    db
      .select({ channel: orders.channel, count: sql`count(*)`.mapWith(Number), revenue: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number) })
      .from(orders)
      .where(and(inMonth, isSale))
      .groupBy(orders.channel),
    db
      .select({ branchId: orders.branchId, branchName: branches.name, count: sql`count(*)`.mapWith(Number), revenue: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number) })
      .from(orders)
      .leftJoin(branches, eq(branches.id, orders.branchId))
      .where(and(inMonth, isSale))
      .groupBy(orders.branchId, branches.name),
    db
      .select({ method: orderTenders.method, amountKobo: sql`coalesce(sum(${orderTenders.amount} - ${orderTenders.changeGiven}), 0)`.mapWith(Number) })
      .from(orderTenders)
      .innerJoin(orders, eq(orders.id, orderTenders.orderId))
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .groupBy(orderTenders.method),
    db
      .select({
        productId: orderItems.productId,
        name: sql`max(${orderItems.productName})`,
        qty: sql`sum(${orderItems.quantity})`.mapWith(Number),
        revenue: sql`sum(${orderItems.lineTotal})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonth, isSale))
      .groupBy(orderItems.productId)
      .orderBy(sql`sum(${orderItems.lineTotal}) desc`)
      .limit(10),
    db
      .select({
        productId: orderItems.productId,
        name: sql`max(${orderItems.productName})`,
        qty: sql`sum(${orderItems.quantity})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonth, isSale))
      .groupBy(orderItems.productId)
      .orderBy(sql`sum(${orderItems.quantity}) desc`)
      .limit(10),
    db
      .select({
        categoryId: products.categoryId,
        name: sql`max(${categories.name})`,
        qty: sql`sum(${orderItems.quantity})`.mapWith(Number),
        revenue: sql`sum(${orderItems.lineTotal})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(inMonth, isSale))
      .groupBy(products.categoryId)
      .orderBy(sql`sum(${orderItems.lineTotal}) desc`)
      .limit(8),
    db
      .select({
        soldByName: orders.soldByName,
        count: sql`count(*)`.mapWith(Number),
        revenue: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(and(inMonth, isSale, sql`${orders.soldByName} is not null`))
      .groupBy(orders.soldByName)
      .orderBy(sql`coalesce(sum(${orders.totalAmount}), 0) desc`),
    db
      .select({ n: sql`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(eq(customers.storeId, storeId), gte(customers.createdAt, start), lt(customers.createdAt, end))),
    db
      .select({ overShortKobo: sql`coalesce(sum(${posSessions.overShort}), 0)`.mapWith(Number), sessions: sql`count(*)`.mapWith(Number) })
      .from(posSessions)
      .innerJoin(posRegisters, eq(posRegisters.id, posSessions.registerId))
      .where(and(eq(posRegisters.storeId, storeId), sql`${posSessions.closedAt} >= ${start.toISOString()}`, sql`${posSessions.closedAt} < ${end.toISOString()}`)),
    db
      .select({ action: storeActivityLogs.action, n: sql`count(*)`.mapWith(Number) })
      .from(storeActivityLogs)
      .where(and(eq(storeActivityLogs.storeId, storeId), gte(storeActivityLogs.createdAt, start), lt(storeActivityLogs.createdAt, end)))
      .groupBy(storeActivityLogs.action),
  ]);

  const net = (totals.gross || 0) + (totals.returnsTotal || 0);
  const activity = Object.fromEntries(activityCounts.map((r) => [r.action, r.n]));

  // --- month-end audit: per-shift cash reconciliation + the stock
  // adjustments made in the month, both by whom ---
  const sessionRows = await db
    .select({
      id: posSessions.id,
      registerName: posRegisters.name,
      closedAt: posSessions.closedAt,
      expected: posSessions.expectedCash,
      counted: posSessions.countedCash,
      overShort: posSessions.overShort,
      closedBy: posSessions.closedBy,
    })
    .from(posSessions)
    .innerJoin(posRegisters, eq(posRegisters.id, posSessions.registerId))
    .where(and(eq(posRegisters.storeId, storeId), sql`${posSessions.closedAt} >= ${start.toISOString()}`, sql`${posSessions.closedAt} < ${end.toISOString()}`))
    .orderBy(sql`${posSessions.closedAt} desc`);

  const closerIds = [...new Set(sessionRows.map((s) => s.closedBy).filter(Boolean))];
  const nameById = {};
  if (closerIds.length) {
    const [staffN, userN] = await Promise.all([
      db.select({ id: staff.id, f: staff.firstName, l: staff.lastName, e: staff.email }).from(staff).where(inArray(staff.id, closerIds)),
      db.select({ id: users.id, f: users.firstName, l: users.lastName, e: users.email }).from(users).where(inArray(users.id, closerIds)),
    ]);
    for (const r of [...staffN, ...userN]) nameById[r.id] = `${r.f || ""} ${r.l || ""}`.trim() || r.e;
  }

  const cashReconciliation = sessionRows.map((s) => ({
    register: s.registerName,
    cashier: nameById[s.closedBy] || "—",
    closedAt: s.closedAt,
    expected: toNaira(s.expected || 0),
    counted: toNaira(s.counted || 0),
    overShort: toNaira(s.overShort || 0),
  }));
  const perPerson = {};
  for (const s of sessionRows) {
    const k = nameById[s.closedBy] || "—";
    perPerson[k] = perPerson[k] || { sessions: 0, kobo: 0 };
    perPerson[k].sessions += 1;
    perPerson[k].kobo += s.overShort || 0;
  }
  const overShortByCashier = Object.entries(perPerson)
    .map(([name, v]) => ({ name, sessions: v.sessions, overShort: toNaira(v.kobo) }))
    .sort((a, b) => a.overShort - b.overShort);

  const stockAdjustments = await db
    .select({ actorName: storeActivityLogs.actorName, summary: storeActivityLogs.summary, createdAt: storeActivityLogs.createdAt })
    .from(storeActivityLogs)
    .where(
      and(
        eq(storeActivityLogs.storeId, storeId),
        gte(storeActivityLogs.createdAt, start),
        lt(storeActivityLogs.createdAt, end),
        or(eq(storeActivityLogs.action, "stock.adjust"), eq(storeActivityLogs.action, "product.update")),
      ),
    )
    .orderBy(desc(storeActivityLogs.createdAt))
    .limit(100);

  return NextResponse.json({
    month: monthParam || `${year}-${String(month + 1).padStart(2, "0")}`,
    label,
    storeName: store.name,
    generatedAt: new Date().toISOString(),
    summary: {
      salesCount: totals.salesCount || 0,
      grossSales: totals.gross || 0,
      returnsCount: totals.returnsCount || 0,
      returnsTotal: totals.returnsTotal || 0,
      netSales: net,
      avgOrderValue: totals.salesCount ? Math.round((totals.gross / totals.salesCount) * 100) / 100 : 0,
      discountsGiven: toNaira(totals.discountsKobo || 0),
      newCustomers: newCust?.n || 0,
      cashOverShort: toNaira(cashVar?.overShortKobo || 0),
      registersClosed: cashVar?.sessions || 0,
    },
    byChannel: byChannel.map((r) => ({ channel: r.channel, count: r.count, revenue: r.revenue })),
    byBranch: byBranch.map((r) => ({ branch: r.branchName || "Unassigned", count: r.count, revenue: r.revenue })),
    byTender: byTender.map((r) => ({ method: r.method, amount: toNaira(r.amountKobo) })),
    topProductsByRevenue: topByRevenue.map((r) => ({ name: r.name, qty: r.qty, revenue: r.revenue })),
    topProductsByQty: topByQty.map((r) => ({ name: r.name, qty: r.qty })),
    byCategory: byCategory.map((r) => ({ name: r.name || "Uncategorised", qty: r.qty, revenue: r.revenue })),
    byCashier: byCashier.map((r) => ({ name: r.soldByName, count: r.count, revenue: r.revenue })),
    activity: {
      sales: (activity["pos.sale"] || 0) + (activity["pos.sale.adjusted"] || 0),
      adjustedSales: activity["pos.sale.adjusted"] || 0,
      returns: activity["pos.return"] || 0,
      cashPaidOut: (activity["cash.paid_out"] || 0) + (activity["cash.drop"] || 0),
      stockAdjustments: activity["stock.adjust"] || 0,
      priceEdits: activity["product.update"] || 0,
      registerCloses: activity["register.close"] || 0,
    },
    cashReconciliation,
    overShortByCashier,
    stockAdjustments: stockAdjustments.map((r) => ({ by: r.actorName, what: r.summary, at: r.createdAt })),
  });
}
