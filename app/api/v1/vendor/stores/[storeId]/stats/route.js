import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { invoiceRequests, orders, products, productVariants, stores } from "../../../../../../../lib/db/schema.js";
import { and, eq, sql } from "drizzle-orm";
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
      // Excludes refunded orders the same way payouts/analytics do -
      // paymentStatus stays "paid" after a refund (see DOCUMENTATION.md),
      // so this needs its own status check to not keep counting them.
      totalRevenue: sql`coalesce(sum(case when ${orders.totalAmount} > 0 then ${orders.vendorPayoutAmount} * least(${orders.amountPaid} / ${orders.totalAmount}, 1) else 0 end) filter (where ${orders.paymentStatus} in ('paid', 'partially_paid') and ${orders.amountPaid} > 0 and ${orders.status} != 'refunded'), 0)`.mapWith(Number),
      totalOrders: sql`count(*) filter (where ${orders.paymentStatus} in ('paid', 'partially_paid') and ${orders.amountPaid} > 0 and ${orders.status} != 'refunded')`.mapWith(Number),
    })
    .from(orders)
    .where(eq(orders.storeId, storeId));

  const [productStats] = await db
    .select({
      total: sql`count(*)`.mapWith(Number),
      live: sql`count(*) filter (where ${products.isActive})`.mapWith(Number),
      // Only physical products with a tracked (non-null) stock count -
      // digital/unlimited items can't be "low".
      lowStock: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} > 0 and ${products.stock} <= ${LOW_STOCK_THRESHOLD})`.mapWith(Number),
      oversold: sql`count(*) filter (where ${products.productType} = 'physical' and ${products.stock} < 0)`.mapWith(Number),
      // Perishables past their date, or within the next 30 days.
      expired: sql`count(*) filter (where ${products.expiryDate} is not null and ${products.expiryDate} < current_date)`.mapWith(Number),
      expiringSoon: sql`count(*) filter (where ${products.expiryDate} is not null and ${products.expiryDate} >= current_date and ${products.expiryDate} < current_date + 30)`.mapWith(Number),
      // Aggregate stock is maintained from branch stock by lib/inventory.
      // Value tracked physical stock at the current effective shelf price;
      // unlimited and negative balances do not have a useful stock value.
      baseStockValue: sql`coalesce(sum(
        ${products.stock} * ${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0)
      ) filter (where ${products.productType} = 'physical' and ${products.isActive} and ${products.stock} is not null and ${products.stock} >= 0), 0)`.mapWith(Number),
    })
    .from(products)
    .where(eq(products.storeId, storeId));

  const [variantStats] = await db
    .select({
      stockValue: sql`coalesce(sum(
        ${productVariants.stock} * coalesce(
          ${productVariants.price},
          ${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0)
        )
      ) filter (where ${productVariants.stock} is not null and ${productVariants.stock} >= 0), 0)`.mapWith(Number),
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(
      eq(products.storeId, storeId),
      eq(products.productType, "physical"),
      eq(products.isActive, true),
      eq(productVariants.isActive, true),
    ));

  const stockValue = (productStats?.baseStockValue || 0) + (variantStats?.stockValue || 0);

  const [invoiceRequestStats] = await db
    .select({
      open: sql`count(*) filter (where ${invoiceRequests.status} in ('new', 'reviewing', 'quoted'))`.mapWith(Number),
    })
    .from(invoiceRequests)
    .where(eq(invoiceRequests.storeId, storeId));

  return NextResponse.json({
    orders: { total: orderStats?.totalOrders || 0, pending: orderStats?.pending || 0 },
    revenue: orderStats?.totalRevenue || 0,
    products: {
      total: productStats?.total || 0,
      live: productStats?.live || 0,
      lowStock: productStats?.lowStock || 0,
      oversold: productStats?.oversold || 0,
      expired: productStats?.expired || 0,
      expiringSoon: productStats?.expiringSoon || 0,
      stockValue,
    },
    invoiceRequests: { open: invoiceRequestStats?.open || 0 },
  });
}
