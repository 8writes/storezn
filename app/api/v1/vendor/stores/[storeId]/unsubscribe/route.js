import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { disableSubscription } from "../../../../../../../lib/paystack.js";
import { isPlusStore } from "../../../../../../../lib/storePlan.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Cancels the renewal - the store stays on Storezn+ until planRenewsAt
// (already paid for), see lib/storePlan.js's getEffectivePlan. plan itself
// only flips to "free" once Paystack confirms via subscription.disable.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPlusStore(store) || store.planCancelled) {
    return NextResponse.json({ error: "This store isn't on an active Storezn+ subscription" }, { status: 400 });
  }
  if (!store.paystackSubscriptionCode || !store.paystackSubscriptionToken) {
    return NextResponse.json({ error: "No subscription on file for this store - contact support" }, { status: 400 });
  }

  try {
    await disableSubscription({ code: store.paystackSubscriptionCode, token: store.paystackSubscriptionToken });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to cancel subscription" }, { status: 502 });
  }

  const [updated] = await db.update(stores).set({ planCancelled: true }).where(eq(stores.id, storeId)).returning();
  return NextResponse.json({ store: updated });
}
