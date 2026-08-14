import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores, orders } from "../../../../../lib/db/schema.js";
import { sql } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";

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

  return NextResponse.json({
    stores: { total: storeRow?.total || 0, active: storeRow?.active || 0, inactive: (storeRow?.total || 0) - (storeRow?.active || 0) },
    revenue: { totalGMV: revenueRow?.totalGMV || 0, totalCommission: revenueRow?.totalCommission || 0 },
  });
}
