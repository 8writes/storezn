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
  cashMovements,
  storeActivityLogs,
} from "../../../../../../../../lib/db/schema.js";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { isEnterpriseStore } from "../../../../../../../../lib/storePlan.js";
import { toNaira } from "../../../../../../../../lib/money.js";
import { formatCurrency } from "../../../../../../../../lib/format.js";

const money = (n) => formatCurrency(Number(n || 0));

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
  if (!isEnterpriseStore(store)) {
    return NextResponse.json({ error: "The monthly report is a Storezn Enterprise feature." }, { status: 402 });
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
    allProductsSold,
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
      .select({
        method: orderTenders.method,
        provider: orderTenders.provider,
        amountKobo: sql`coalesce(sum(case when ${orderTenders.method} = 'cash' then ${orderTenders.amount} - ${orderTenders.changeGiven} else ${orderTenders.amount} end), 0)`.mapWith(Number),
      })
      .from(orderTenders)
      .innerJoin(orders, eq(orders.id, orderTenders.orderId))
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .groupBy(orderTenders.method, orderTenders.provider),
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
    // Every product sold this month, no cap - the full ledger, not just
    // the top-10 glance above. minPrice/maxPrice differing is the tell
    // that this product didn't sell at one price all month, whether from
    // a cashier's per-sale override (see overrideLines/givenAway) or the
    // catalogue price itself moving mid-month (cross-checked against
    // priceChangedProductIds below).
    db
      .select({
        productId: orderItems.productId,
        name: sql`max(${orderItems.productName})`,
        qty: sql`sum(${orderItems.quantity})`.mapWith(Number),
        revenue: sql`sum(${orderItems.lineTotal})`.mapWith(Number),
        minPrice: sql`min(${orderItems.unitPrice})`.mapWith(Number),
        maxPrice: sql`max(${orderItems.unitPrice})`.mapWith(Number),
        overrideLines: sql`count(*) filter (where ${orderItems.priceOverridden})`.mapWith(Number),
        givenAway: sql`coalesce(sum((${orderItems.originalUnitPrice} - ${orderItems.unitPrice}) * ${orderItems.quantity}) filter (where ${orderItems.priceOverridden}), 0)`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonth, isSale))
      .groupBy(orderItems.productId)
      .orderBy(sql`sum(${orderItems.lineTotal}) desc`),
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
      closeMethod: posSessions.closeMethod,
      provisional: posSessions.provisional,
      pendingSyncCount: posSessions.pendingSyncCount,
      reviewStatus: posSessions.reviewStatus,
      forcedReason: posSessions.forcedReason,
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
    cashier: nameById[s.closedBy] || "N/A",
    closedAt: s.closedAt,
    expected: toNaira(s.expected || 0),
    counted: toNaira(s.counted || 0),
    overShort: toNaira(s.overShort || 0),
    notCounted: s.closeMethod === "forced_uncounted",
    provisional: !!s.provisional,
    needsReview: s.reviewStatus === "pending",
    forcedReason: s.forcedReason || null,
  }));
  const perPerson = {};
  for (const s of sessionRows) {
    const k = nameById[s.closedBy] || "N/A";
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

  // Which products had their catalogue price itself edited this month
  // (product.update, not a per-sale override) - flagged on the full
  // products-sold ledger below, next to that product's own price range.
  // A separate, lighter query from stockAdjustments above (just enough to
  // build the id set) so its own 100-row display cap can't hide a price
  // change from this check.
  const priceChangeLogRows = await db
    .select({ targetId: storeActivityLogs.targetId, summary: storeActivityLogs.summary })
    .from(storeActivityLogs)
    .where(
      and(
        eq(storeActivityLogs.storeId, storeId),
        eq(storeActivityLogs.action, "product.update"),
        gte(storeActivityLogs.createdAt, start),
        lt(storeActivityLogs.createdAt, end),
      ),
    )
    .limit(5000);
  const priceChangedProductIds = new Set(
    priceChangeLogRows.filter((r) => /\bprice /.test(r.summary || "")).map((r) => r.targetId),
  );

  // ---------- forensic detail: every money-touching action, line-level ----------
  const inMonthCreated = and(gte(orders.createdAt, start), lt(orders.createdAt, end), eq(orders.storeId, storeId));

  const [
    discountRows,
    overrideRows,
    refundRows,
    cashOutRows,
    salesByStaffRows,
    discByStaffRows,
    ovrByStaffRows,
    retByStaffRows,
    lineDiscTotalRow,
    ovrGivenTotalRow,
  ] = await Promise.all([
    // every whole-order markdown
    db
      .select({ orderNumber: orders.orderNumber, at: orders.createdAt, by: orders.soldByName, amountKobo: orders.discountAmount, reason: orders.discountReason })
      .from(orders)
      .where(and(inMonthCreated, sql`${orders.discountAmount} > 0`))
      .orderBy(desc(orders.createdAt))
      .limit(300),
    // every line where the cashier typed a different price
    db
      .select({
        orderNumber: orders.orderNumber,
        at: orders.createdAt,
        by: orders.soldByName,
        product: orderItems.productName,
        qty: orderItems.quantity,
        catalogue: orderItems.originalUnitPrice,
        charged: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonthCreated, eq(orderItems.priceOverridden, true)))
      .orderBy(desc(orders.createdAt))
      .limit(300),
    // every return / refund
    db
      .select({
        orderNumber: orders.orderNumber,
        at: orders.createdAt,
        by: orders.soldByName,
        amount: orders.totalAmount, // negative
        against: orders.note,
      })
      .from(orders)
      .where(and(inMonthCreated, sql`${orders.originalOrderId} is not null`))
      .orderBy(desc(orders.createdAt))
      .limit(300),
    // every cash pulled out of a drawer
    db
      .select({
        at: cashMovements.createdAt,
        by: cashMovements.createdBy,
        kind: cashMovements.kind,
        amountKobo: cashMovements.amount, // negative for paid_out / drop
        reason: cashMovements.reason,
      })
      .from(cashMovements)
      .innerJoin(posSessions, eq(posSessions.id, cashMovements.sessionId))
      .innerJoin(posRegisters, eq(posRegisters.id, posSessions.registerId))
      .where(and(eq(posRegisters.storeId, storeId), gte(cashMovements.createdAt, start), lt(cashMovements.createdAt, end), inArray(cashMovements.kind, ["paid_out", "drop", "paid_in"])))
      .orderBy(desc(cashMovements.createdAt))
      .limit(300),
    // per-staff sales
    db
      .select({ by: orders.soldByName, count: sql`count(*)`.mapWith(Number), value: sql`coalesce(sum(${orders.totalAmount}),0)`.mapWith(Number) })
      .from(orders)
      .where(and(inMonthCreated, isSale, sql`${orders.soldByName} is not null`))
      .groupBy(orders.soldByName),
    // per-staff whole-order discounts
    db
      .select({ by: orders.soldByName, count: sql`count(*)`.mapWith(Number), kobo: sql`coalesce(sum(${orders.discountAmount}),0)`.mapWith(Number) })
      .from(orders)
      .where(and(inMonthCreated, sql`${orders.discountAmount} > 0`, sql`${orders.soldByName} is not null`))
      .groupBy(orders.soldByName),
    // per-staff price overrides (value given away = catalogue value - line total)
    db
      .select({
        by: orders.soldByName,
        lines: sql`count(*)`.mapWith(Number),
        given: sql`coalesce(sum(coalesce(${orderItems.originalUnitPrice}, ${orderItems.unitPrice}) * ${orderItems.quantity} - ${orderItems.lineTotal}), 0)`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonthCreated, eq(orderItems.priceOverridden, true), sql`${orders.soldByName} is not null`))
      .groupBy(orders.soldByName),
    // per-staff returns
    db
      .select({ by: orders.soldByName, count: sql`count(*)`.mapWith(Number), value: sql`coalesce(sum(-${orders.totalAmount}),0)`.mapWith(Number) })
      .from(orders)
      .where(and(inMonthCreated, sql`${orders.originalOrderId} is not null`, sql`${orders.soldByName} is not null`))
      .groupBy(orders.soldByName),
    // store-wide line-discount total (kobo)
    db
      .select({ kobo: sql`coalesce(sum(${orderItems.lineDiscount}),0)`.mapWith(Number) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonthCreated, isSale)),
    // store-wide value given away via overrides (naira)
    db
      .select({ naira: sql`coalesce(sum(coalesce(${orderItems.originalUnitPrice}, ${orderItems.unitPrice}) * ${orderItems.quantity} - ${orderItems.lineTotal}), 0)`.mapWith(Number) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inMonthCreated, isSale, eq(orderItems.priceOverridden, true))),
  ]);

  // resolve cash-movement actor ids -> names (closers already resolved above)
  const cashActorIds = [...new Set(cashOutRows.map((r) => r.by).filter((v) => v && !nameById[v]))];
  if (cashActorIds.length) {
    const [sN, uN] = await Promise.all([
      db.select({ id: staff.id, f: staff.firstName, l: staff.lastName, e: staff.email }).from(staff).where(inArray(staff.id, cashActorIds)),
      db.select({ id: users.id, f: users.firstName, l: users.lastName, e: users.email }).from(users).where(inArray(users.id, cashActorIds)),
    ]);
    for (const r of [...sN, ...uN]) nameById[r.id] = `${r.f || ""} ${r.l || ""}`.trim() || r.e;
  }

  // ---- assemble per-staff ----
  const staffMap = new Map();
  const bump = (name, patch) => {
    const key = name || "Unknown";
    const cur = staffMap.get(key) || {
      name: key, salesCount: 0, salesValue: 0, discountsCount: 0, discountsValue: 0,
      overrideLines: 0, overridesValue: 0, returnsCount: 0, returnsValue: 0,
      cashOutCount: 0, cashOutValue: 0, shifts: 0, overShort: 0,
    };
    staffMap.set(key, { ...cur, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, (cur[k] || 0) + v])) });
  };
  for (const r of salesByStaffRows) bump(r.by, { salesCount: r.count, salesValue: r.value });
  for (const r of discByStaffRows) bump(r.by, { discountsCount: r.count, discountsValue: toNaira(r.kobo) });
  for (const r of ovrByStaffRows) bump(r.by, { overrideLines: r.lines, overridesValue: r.given });
  for (const r of retByStaffRows) bump(r.by, { returnsCount: r.count, returnsValue: r.value });
  for (const r of cashOutRows) {
    if (r.kind === "paid_in") continue;
    bump(nameById[r.by] || "Unknown", { cashOutCount: 1, cashOutValue: toNaira(-r.amountKobo) });
  }
  for (const s of sessionRows) {
    const n = nameById[s.closedBy] || "Unknown";
    bump(n, { shifts: 1, overShort: toNaira(s.overShort || 0) });
  }
  const perStaff = [...staffMap.values()].sort((a, b) => b.salesValue - a.salesValue);

  // ---- reconciliation ----
  const drawerVarianceTotal = toNaira(cashVar?.overShortKobo || 0);
  const discountsTotal = toNaira((totals.discountsKobo || 0) + (lineDiscTotalRow?.[0]?.kobo || 0));
  const overridesGivenTotal = ovrGivenTotalRow?.[0]?.naira || 0;
  const refundsTotal = Math.abs(totals.returnsTotal || 0);
  const paidOutTotal = cashOutRows.filter((r) => r.kind !== "paid_in").reduce((s, r) => s + toNaira(-r.amountKobo), 0);
  const paidInTotal = cashOutRows.filter((r) => r.kind === "paid_in").reduce((s, r) => s + toNaira(r.amountKobo), 0);

  // ---- review flags ----
  const flags = [];
  const notCounted = cashReconciliation.filter((r) => r.notCounted);
  if (notCounted.length) {
    flags.push(
      `${notCounted.length} shift${notCounted.length === 1 ? " was" : "s were"} closed WITHOUT counting the drawer (system figure used), no real cash check happened.`,
    );
  }
  const awaitingReview = cashReconciliation.filter((r) => r.needsReview);
  if (awaitingReview.length) {
    flags.push(`${awaitingReview.length} shift close${awaitingReview.length === 1 ? "" : "s"} still awaiting owner review.`);
  }
  const provisionalShifts = cashReconciliation.filter((r) => r.provisional);
  if (provisionalShifts.length) {
    flags.push(`${provisionalShifts.length} shift${provisionalShifts.length === 1 ? "" : "s"} closed with sales still unsynced, figures provisional.`);
  }
  const shortSessions = cashReconciliation.filter((r) => r.overShort < 0);
  if (shortSessions.length) {
    const t = shortSessions.reduce((s, r) => s + r.overShort, 0);
    flags.push(`${shortSessions.length} shift${shortSessions.length === 1 ? "" : "s"} came up short: ${money(Math.abs(t))} in total.`);
  }
  for (const p of overShortByCashier) {
    if (p.overShort < 0) flags.push(`${p.name}: ${money(Math.abs(p.overShort))} short across ${p.sessions} shift${p.sessions === 1 ? "" : "s"}.`);
  }
  for (const s of perStaff) {
    if (s.discountsValue + s.overridesValue >= 5000)
      flags.push(`${s.name} gave away ${money(s.discountsValue + s.overridesValue)} (${s.discountsCount} discounts, ${s.overrideLines} price overrides).`);
    if (s.returnsValue >= 5000) flags.push(`${s.name} processed ${money(s.returnsValue)} in returns (${s.returnsCount}).`);
    if (s.cashOutValue >= 5000) flags.push(`${s.name} took ${money(s.cashOutValue)} out of the drawer (${s.cashOutCount} paid-out/drops).`);
  }

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
    byTender: Object.values(
      byTender.reduce((acc, r) => {
        acc[r.method] = acc[r.method] || { method: r.method, amountKobo: 0 };
        acc[r.method].amountKobo += r.amountKobo;
        return acc;
      }, {}),
    ).map((r) => ({ method: r.method, amount: toNaira(r.amountKobo) })),
    // Full traceability: every non-cash stream by the account it landed in.
    byAccount: byTender
      .filter((r) => r.method !== "cash")
      .map((r) => ({ method: r.method, provider: (r.provider || "").trim() || "Unspecified", amount: toNaira(r.amountKobo) }))
      .sort((a, b) => b.amount - a.amount),
    topProductsByRevenue: topByRevenue.map((r) => ({ name: r.name, qty: r.qty, revenue: r.revenue })),
    topProductsByQty: topByQty.map((r) => ({ name: r.name, qty: r.qty })),
    // Every product sold this month, no cap - qty, revenue, the price
    // range it actually sold at, and whether that range comes from
    // per-sale overrides, a catalogue price edit, or both.
    allProductsSold: allProductsSold.map((r) => ({
      productId: r.productId,
      name: r.name,
      qty: r.qty,
      revenue: r.revenue,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      priceVaried: r.minPrice !== r.maxPrice,
      overrideLines: r.overrideLines,
      givenAway: r.givenAway,
      catalogueChanged: priceChangedProductIds.has(r.productId),
    })),
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
    reconciliation: {
      grossSales: totals.gross || 0,
      netSales: net,
      drawerVarianceTotal,
      discountsTotal,
      overridesGivenTotal,
      refundsTotal,
      paidOutTotal,
      paidInTotal,
      moneyGivenAway: discountsTotal + overridesGivenTotal + refundsTotal,
    },
    reviewFlags: flags,
    perStaff,
    detail: {
      discounts: discountRows.map((r) => ({ orderNumber: r.orderNumber, at: r.at, by: r.by, amount: toNaira(r.amountKobo), reason: r.reason || null })),
      priceOverrides: overrideRows.map((r) => ({
        orderNumber: r.orderNumber, at: r.at, by: r.by, product: r.product, qty: r.qty,
        catalogue: r.catalogue ?? r.charged, charged: r.charged, lineTotal: r.lineTotal,
        givenAway: (r.catalogue ?? r.charged) * r.qty - r.lineTotal,
      })),
      returns: refundRows.map((r) => ({ orderNumber: r.orderNumber, at: r.at, by: r.by, amount: Math.abs(r.amount), note: r.against || null })),
      cashMovements: cashOutRows.map((r) => ({
        at: r.at, by: nameById[r.by] || "N/A", kind: r.kind,
        amount: toNaira(Math.abs(r.amountKobo)), reason: r.reason || null,
      })),
    },
    cashReconciliation,
    overShortByCashier,
    stockAdjustments: stockAdjustments.map((r) => ({ by: r.actorName, what: r.summary, at: r.createdAt })),
  });
}
