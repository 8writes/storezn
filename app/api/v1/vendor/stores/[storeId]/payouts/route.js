import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { invoicePayments, orders, stores } from "../../../../../../../lib/db/schema.js";
import { eq, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

const payoutEvents = sql`
  select
    o.id as event_id,
    o.id as order_id,
    o.order_number,
    o.created_at,
    o.paid_at,
    o.total_amount,
    o.commission_rate_percent,
    o.commission_amount,
    o.flat_fee_amount,
    o.vendor_payout_amount,
    o.is_offline,
    o.status,
    o.settled_at,
    null::text as payment_kind
  from ${orders} o
  where o.invoice_id is null
    and o.payment_status = 'paid'
    and o.status != 'refunded'
  union all
  select
    ip.id as event_id,
    o.id as order_id,
    o.order_number,
    ip.created_at,
    ip.paid_at,
    ip.amount as total_amount,
    o.commission_rate_percent,
    case when o.total_amount > 0 then o.commission_amount * ip.amount / o.total_amount else 0 end as commission_amount,
    case when o.total_amount > 0 then o.flat_fee_amount * ip.amount / o.total_amount else 0 end as flat_fee_amount,
    case when o.total_amount > 0 then o.vendor_payout_amount * ip.amount / o.total_amount else 0 end as vendor_payout_amount,
    false as is_offline,
    o.status,
    ip.settled_at,
    ip.kind::text as payment_kind
  from ${invoicePayments} ip
  inner join ${orders} o on o.invoice_id = ip.invoice_id
  where ip.status = 'paid'
    and o.status != 'refunded'
`;

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const channel = searchParams.get("channel");
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const channelFilter = channel === "online" ? sql`and not e.is_offline` : channel === "offline" ? sql`and e.is_offline` : sql``;
  const searchFilter = q ? sql`and e.order_number ilike ${`%${q}%`}` : sql``;

  const [statsRows, countRows, rows] = await Promise.all([
    db.execute(sql`
      with e as (${payoutEvents})
      select
        coalesce(sum(e.vendor_payout_amount), 0)::float as "lifetimeTotal",
        coalesce(sum(e.vendor_payout_amount) filter (where not e.is_offline), 0)::float as "onlineTotal",
        coalesce(sum(e.vendor_payout_amount) filter (where e.is_offline), 0)::float as "offlineTotal",
        coalesce(sum(e.vendor_payout_amount) filter (where e.paid_at >= date_trunc('month', now())), 0)::float as "thisMonthTotal",
        count(*)::int as "ordersCount",
        count(*) filter (where not e.is_offline and e.settled_at is null)::int as "pendingSettlementCount",
        max(e.paid_at) as "lastPayoutAt"
      from e
      inner join ${orders} scoped_order on scoped_order.id = e.order_id
      where scoped_order.store_id = ${storeId}
    `),
    db.execute(sql`
      with e as (${payoutEvents})
      select count(*)::int as total
      from e
      inner join ${orders} scoped_order on scoped_order.id = e.order_id
      where scoped_order.store_id = ${storeId} ${channelFilter} ${searchFilter}
    `),
    db.execute(sql`
      with e as (${payoutEvents})
      select
        e.event_id as id,
        e.order_id as "orderId",
        e.order_number as "orderNumber",
        e.created_at as "createdAt",
        e.paid_at as "paidAt",
        e.total_amount::float as "totalAmount",
        e.commission_rate_percent::float as "commissionRatePercent",
        e.commission_amount::float as "commissionAmount",
        e.flat_fee_amount::float as "flatFeeAmount",
        e.vendor_payout_amount::float as "vendorPayoutAmount",
        e.is_offline as "isOffline",
        e.status,
        e.settled_at as "settledAt",
        e.payment_kind as "paymentKind"
      from e
      inner join ${orders} scoped_order on scoped_order.id = e.order_id
      where scoped_order.store_id = ${storeId} ${channelFilter} ${searchFilter}
      order by e.paid_at desc nulls last, e.created_at desc
      limit ${limit} offset ${offset}
    `),
  ]);

  const total = Number(countRows[0]?.total) || 0;
  return NextResponse.json({
    payoutAccount: store.subAccountCode
      ? { bankName: store.bankName, accountNumber: store.accountNumber, accountName: store.accountName }
      : null,
    stats: statsRows[0] || {
      lifetimeTotal: 0,
      onlineTotal: 0,
      offlineTotal: 0,
      thisMonthTotal: 0,
      ordersCount: 0,
      pendingSettlementCount: 0,
      lastPayoutAt: null,
    },
    transactions: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
