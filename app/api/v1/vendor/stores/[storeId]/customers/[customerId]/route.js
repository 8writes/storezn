import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { customers, orders, stores } from "../../../../../../../../lib/db/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// A single customer's profile plus their full order history with this
// store specifically - a customer's account can only belong to one store
// (customers.storeId), so there's no cross-store leakage risk here to
// guard against beyond confirming the customer actually belongs to this
// store.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, customerId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [customer] = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
    .limit(1);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [customerOrders, [stats]] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.userId, customerId), eq(orders.storeId, storeId))).orderBy(desc(orders.createdAt)),
    db
      .select({
        orderCount: sql`count(*) filter (where ${orders.paymentStatus} = 'paid')`.mapWith(Number),
        totalSpent: sql`coalesce(sum(${orders.totalAmount}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(and(eq(orders.userId, customerId), eq(orders.storeId, storeId))),
  ]);

  return NextResponse.json({ customer, orders: customerOrders, stats });
}
