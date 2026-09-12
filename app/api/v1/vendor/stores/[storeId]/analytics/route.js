import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, orderItems, products, categories, customers, branches, refundRequests, stores } from "../../../../../../../lib/db/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { LOW_STOCK_THRESHOLD } from "../../../../../../../lib/inventory.js";

const MAX_RANGE_DAYS = 366;

function parseDateParam(value, fallback) {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Everything the vendor analytics page needs in one call, all scoped to
// the requested date range (+ optional branch/channel filter) so the page
// doesn't have to fan out to a dozen endpoints. Revenue-bearing sections
// use the same "paid and not refunded" definition as stats/route.js and
// the super-admin analytics route (a pending/failed/refunded order was
// never real revenue) - statusBreakdown is the one deliberate exception,
// since seeing cancelled/refunded volume is the whole point of that chart.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  let from = parseDateParam(searchParams.get("from"), defaultFrom);
  let to = parseDateParam(searchParams.get("to"), today);
  if (from > to) [from, to] = [to, from];
  let rangeDays = Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
  // An overly wide custom range pulls `from` forward to fit the cap,
  // keeping `to` fixed - the recent end is what "tracking" actually cares
  // about, an overly wide range should never silently drop it.
  if (rangeDays > MAX_RANGE_DAYS) {
    from = new Date(to.getTime() - (MAX_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    rangeDays = MAX_RANGE_DAYS;
  }

  const branchId = searchParams.get("branchId")?.trim() || null;
  const channel = searchParams.get("channel") === "online" || searchParams.get("channel") === "offline" ? searchParams.get("channel") : "all";

  // Equal-length window immediately before `from`, for the summary cards'
  // "vs previous period" comparison.
  const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);

  const scopeConditions = [eq(orders.storeId, storeId)];
  if (branchId) scopeConditions.push(eq(orders.branchId, branchId));
  if (channel === "online") scopeConditions.push(eq(orders.isOffline, false));
  if (channel === "offline") scopeConditions.push(eq(orders.isOffline, true));

  const revenueConditions = [...scopeConditions, sql`${orders.paymentStatus} = 'paid' and ${orders.status} != 'refunded'`];
  const inRange = (col, f, t) => sql`${col}::date >= ${toDateOnly(f)} and ${col}::date <= ${toDateOnly(t)}`;

  const [summaryRow] = await db
    .select({
      revenue: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number),
      gmv: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number),
      orderCount: sql`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)));

  const [prevSummaryRow] = await db
    .select({
      revenue: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number),
      orderCount: sql`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(and(...revenueConditions, inRange(orders.paidAt, prevFrom, prevTo)));

  const [unitsRow] = await db
    .select({ units: sql`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number) })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)));

  const [newCustomersRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(customers)
    .where(and(eq(customers.storeId, storeId), inRange(customers.createdAt, from, to)));

  // One row per calendar day in range, zero-filled for days with no paid
  // orders - see the identical pattern (and reasoning) in the super-admin
  // analytics route.
  const branchFilterSql = branchId ? sql` and o.branch_id = ${branchId}` : sql``;
  const channelFilterSql = channel === "online" ? sql` and o.is_offline = false` : channel === "offline" ? sql` and o.is_offline = true` : sql``;
  const dailyRows = await db.execute(sql`
    select
      d::date as day,
      coalesce(sum(o.vendor_payout_amount), 0)::float as revenue,
      count(o.id)::int as order_count
    from generate_series(${toDateOnly(from)}::date, ${toDateOnly(to)}::date, interval '1 day') as d
    left join ${orders} o on o.store_id = ${storeId} and o.payment_status = 'paid' and o.status != 'refunded' and o.paid_at::date = d::date${branchFilterSql}${channelFilterSql}
    group by d
    order by d
  `);

  // Every order placed in range regardless of payment/refund status - the
  // one section where cancelled/refunded volume is the point, not noise.
  const statusRows = await db
    .select({ status: orders.status, count: sql`count(*)`.mapWith(Number) })
    .from(orders)
    .where(and(...scopeConditions, inRange(orders.createdAt, from, to)))
    .groupBy(orders.status);

  const channelRows = await db
    .select({ isOffline: orders.isOffline, revenue: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number), count: sql`count(*)`.mapWith(Number) })
    .from(orders)
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)))
    .groupBy(orders.isOffline);

  const topProducts = await db
    .select({
      productId: orderItems.productId,
      name: sql`max(${orderItems.productName})`,
      image: sql`max(${orderItems.productImage})`,
      revenue: sql`coalesce(sum(${orderItems.lineTotal}), 0)`.mapWith(Number),
      units: sql`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)))
    .groupBy(orderItems.productId)
    .orderBy(desc(sql`coalesce(sum(${orderItems.lineTotal}), 0)`))
    .limit(10);

  const categoryBreakdown = await db
    .select({
      categoryId: categories.id,
      name: sql`coalesce(${categories.name}, 'Uncategorized')`,
      revenue: sql`coalesce(sum(${orderItems.lineTotal}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)))
    .groupBy(categories.id, categories.name)
    .orderBy(desc(sql`coalesce(sum(${orderItems.lineTotal}), 0)`))
    .limit(8);

  const branchBreakdown = await db
    .select({
      branchId: branches.id,
      name: branches.name,
      revenue: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number),
      count: sql`count(${orders.id})`.mapWith(Number),
    })
    .from(branches)
    .leftJoin(orders, and(eq(orders.branchId, branches.id), ...revenueConditions, inRange(orders.paidAt, from, to)))
    .where(eq(branches.storeId, storeId))
    .groupBy(branches.id, branches.name)
    .orderBy(desc(sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`));

  // Registered customers only - a guest/offline buyer has no persistent
  // identity to rank across orders (see orders.userId's own comment).
  const topCustomers = await db
    .select({
      customerId: customers.id,
      name: sql`trim(coalesce(${customers.firstName}, '') || ' ' || coalesce(${customers.lastName}, ''))`,
      email: customers.email,
      revenue: sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`.mapWith(Number),
      orderCount: sql`count(${orders.id})`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(customers, eq(orders.userId, customers.id))
    .where(and(...revenueConditions, inRange(orders.paidAt, from, to)))
    .groupBy(customers.id, customers.firstName, customers.lastName, customers.email)
    .orderBy(desc(sql`coalesce(sum(${orders.vendorPayoutAmount}), 0)`))
    .limit(10);

  const [refundRow] = await db
    .select({
      pending: sql`count(*) filter (where ${refundRequests.status} = 'pending')`.mapWith(Number),
      approved: sql`count(*) filter (where ${refundRequests.status} = 'approved')`.mapWith(Number),
      rejected: sql`count(*) filter (where ${refundRequests.status} = 'rejected')`.mapWith(Number),
    })
    .from(refundRequests)
    .innerJoin(orders, eq(refundRequests.orderId, orders.id))
    .where(and(eq(orders.storeId, storeId), inRange(refundRequests.createdAt, from, to)));

  const [productStats] = await db
    .select({
      total: sql`count(*)`.mapWith(Number),
      live: sql`count(*) filter (where ${products.isActive})`.mapWith(Number),
      lowStock: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} is not null and ${products.stock} > 0 and ${products.stock} <= ${LOW_STOCK_THRESHOLD})`.mapWith(Number),
      outOfStock: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} = 0)`.mapWith(Number),
      // Below zero means more was sold/adjusted out than was ever recorded
      // as in stock - a real accounting problem, distinct from (and not
      // counted by) outOfStock above, which only catches exactly 0.
      negativeStock: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} < 0)`.mapWith(Number),
      expiringSoon: sql`count(*) filter (where ${products.expiryDate} is not null and ${products.expiryDate} >= current_date and ${products.expiryDate} < current_date + 30)`.mapWith(Number),
      expired: sql`count(*) filter (where ${products.expiryDate} is not null and ${products.expiryDate} < current_date)`.mapWith(Number),
      // What's on the shelf is worth, at shelf price and at what it cost to
      // stock it - only live products, and only counting stock that's
      // actually >= 0 (a negative balance, see negativeStock, has no
      // sensible value to add in).
      retailValue: sql`coalesce(sum(${products.price} * ${products.stock}) filter (where ${products.isActive} and ${products.stock} is not null and ${products.stock} >= 0), 0)`.mapWith(Number),
      costValue: sql`coalesce(sum(${products.costPrice} * ${products.stock}) filter (where ${products.isActive} and ${products.stock} is not null and ${products.stock} >= 0 and ${products.costPrice} is not null), 0)`.mapWith(Number),
    })
    .from(products)
    .where(eq(products.storeId, storeId));

  const revenue = summaryRow?.revenue || 0;
  const orderCount = summaryRow?.orderCount || 0;
  const prevRevenue = prevSummaryRow?.revenue || 0;
  const prevOrderCount = prevSummaryRow?.orderCount || 0;
  const pctChange = (current, prev) => (prev > 0 ? ((current - prev) / prev) * 100 : current > 0 ? 100 : 0);

  return NextResponse.json({
    range: { from: toDateOnly(from), to: toDateOnly(to) },
    summary: {
      revenue,
      revenueChangePercent: pctChange(revenue, prevRevenue),
      gmv: summaryRow?.gmv || 0,
      orderCount,
      orderCountChangePercent: pctChange(orderCount, prevOrderCount),
      averageOrderValue: orderCount > 0 ? revenue / orderCount : 0,
      unitsSold: unitsRow?.units || 0,
      newCustomers: newCustomersRow?.count || 0,
    },
    daily: dailyRows.map((r) => ({ day: r.day, revenue: r.revenue, orderCount: r.order_count })),
    statusBreakdown: statusRows.map((r) => ({ status: r.status, count: r.count })),
    channelBreakdown: channelRows.map((r) => ({ channel: r.isOffline ? "offline" : "online", revenue: r.revenue, count: r.count })),
    topProducts,
    categoryBreakdown,
    branchBreakdown: branchBreakdown.length > 1 ? branchBreakdown : [],
    topCustomers,
    refunds: { pending: refundRow?.pending || 0, approved: refundRow?.approved || 0, rejected: refundRow?.rejected || 0 },
    products: {
      total: productStats?.total || 0,
      live: productStats?.live || 0,
      lowStock: productStats?.lowStock || 0,
      outOfStock: productStats?.outOfStock || 0,
      negativeStock: productStats?.negativeStock || 0,
      expiringSoon: productStats?.expiringSoon || 0,
      expired: productStats?.expired || 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      retailValue: productStats?.retailValue || 0,
      costValue: productStats?.costValue || 0,
    },
  });
}
