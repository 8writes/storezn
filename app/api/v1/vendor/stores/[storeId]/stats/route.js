import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { orders, products, stores } from "../../../../../../../lib/db/schema.js";
import { eq, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { LOW_STOCK_THRESHOLD } from "../../../../../../../lib/inventory.js";

// Small stats summary for the vendor dashboard landing page - revenue
// only counts paid orders, same reasoning as the super-admin analytics
// route (a pending/failed order was never real revenue).
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [orderStats] = await db
    .select({
      pending: sql`count(*) filter (where ${orders.status} in ('processing', 'shipped'))`.mapWith(Number),
      totalRevenue: sql`coalesce(sum(${orders.vendorPayoutAmount}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(Number),
      totalOrders: sql`count(*) filter (where ${orders.paymentStatus} = 'paid')`.mapWith(Number),
    })
    .from(orders)
    .where(eq(orders.storeId, storeId));

  const [productStats] = await db
    .select({
      total: sql`count(*)`.mapWith(Number),
      live: sql`count(*) filter (where ${products.isActive})`.mapWith(Number),
      // Only physical products with a tracked (non-null) stock count -
      // digital/unlimited items can't be "low".
      lowStock: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} is not null and ${products.stock} <= ${LOW_STOCK_THRESHOLD})`.mapWith(Number),
    })
    .from(products)
    .where(eq(products.storeId, storeId));

  return NextResponse.json({
    orders: { total: orderStats?.totalOrders || 0, pending: orderStats?.pending || 0 },
    revenue: orderStats?.totalRevenue || 0,
    products: { total: productStats?.total || 0, live: productStats?.live || 0, lowStock: productStats?.lowStock || 0 },
  });
}
