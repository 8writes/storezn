import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores, orders, storeSubscriptionTransactions } from "../../../../../lib/db/schema.js";
import { sql, desc } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";

const TIMESERIES_DAYS = 30;

// Platform-wide numbers for the super-admin landing page.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [storeRow] = await db
    .select({
      total: sql`count(*)`.mapWith(Number),
      active: sql`count(*) filter (where ${stores.isActive})`.mapWith(Number),
    })
    .from(stores);

  // Revenue only counts orders that actually got paid - a pending/failed
  // order was never real GMV.
  const [revenueRow] = await db
    .select({
      totalGMV: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number),
      // Total platform revenue - percentage commission plus the flat fee
      // per order (see platformSettings.defaultFlatFee), both are money
      // the platform actually kept, not just the percentage piece.
      totalCommission: sql`coalesce(sum(${orders.commissionAmount} + ${orders.flatFeeAmount}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(sql`${orders.paymentStatus} = 'paid'`);

  // One row per calendar day over the trailing window, zero-filled for
  // days with no paid orders (generate_series left-joined against actual
  // orders) - a chart with gaps for empty days reads as broken, not as
  // "no sales that day".
  const dailyRows = await db.execute(sql`
    select
      d::date as day,
      coalesce(sum(o.total_amount), 0)::float as gmv,
      coalesce(sum(o.commission_amount + o.flat_fee_amount), 0)::float as commission,
      count(o.id)::int as order_count
    from generate_series(current_date - interval '${sql.raw(String(TIMESERIES_DAYS - 1))} days', current_date, interval '1 day') as d
    left join ${orders} o on o.payment_status = 'paid' and o.paid_at::date = d::date
    group by d
    order by d
  `);

  // Storezn+ - total revenue ever collected (initial + renewal charges,
  // see the webhook's recordSubscriptionTransaction) and how many stores
  // are Plus right now. Not "MRR" - plan is self-healing (see
  // lib/storePlan.js's getEffectivePlan), so counting stores.plan = 'plus'
  // directly already excludes anyone whose subscription has actually
  // lapsed.
  const [subscriptionRow] = await db
    .select({ totalRevenue: sql`coalesce(sum(${storeSubscriptionTransactions.amount}), 0)`.mapWith(Number) })
    .from(storeSubscriptionTransactions);
  const [plusStoreRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(stores)
    .where(sql`${stores.plan} = 'plus'`);

  // Top 5 stores by paid GMV, all-time - a quick "who's actually driving
  // the platform" glance next to the trend chart.
  const topStores = await db
    .select({
      id: stores.id,
      name: stores.name,
      gmv: sql`coalesce(sum(${orders.totalAmount}), 0)`.mapWith(Number),
    })
    .from(stores)
    .leftJoin(orders, sql`${orders.storeId} = ${stores.id} and ${orders.paymentStatus} = 'paid'`)
    .groupBy(stores.id, stores.name)
    .orderBy(desc(sql`coalesce(sum(${orders.totalAmount}), 0)`))
    .limit(5);

  return NextResponse.json({
    stores: { total: storeRow?.total || 0, active: storeRow?.active || 0, inactive: (storeRow?.total || 0) - (storeRow?.active || 0) },
    revenue: { totalGMV: revenueRow?.totalGMV || 0, totalCommission: revenueRow?.totalCommission || 0 },
    subscriptions: { totalRevenue: subscriptionRow?.totalRevenue || 0, plusStores: plusStoreRow?.count || 0 },
    daily: dailyRows.map((r) => ({ day: r.day, gmv: r.gmv, commission: r.commission, orderCount: r.order_count })),
    topStores: topStores.filter((s) => s.gmv > 0),
  });
}
