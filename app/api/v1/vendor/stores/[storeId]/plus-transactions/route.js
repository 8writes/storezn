import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, storeSubscriptionTransactions } from "../../../../../../../lib/db/schema.js";
import { eq, desc } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";

// Storezn+ billing history - owner-only, same as the subscribe/unsubscribe
// routes (see isStoreOwner in lib/auth.js), so a staff member can't see
// what the store's been charged.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transactions = await db
    .select()
    .from(storeSubscriptionTransactions)
    .where(eq(storeSubscriptionTransactions.storeId, storeId))
    .orderBy(desc(storeSubscriptionTransactions.paidAt))
    .limit(50);

  return NextResponse.json({ transactions });
}
