import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, storeSubscriptionTransactions } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../../lib/auth.js";
import { validate, manualPlusActivationSchema } from "../../../../../../../lib/validate.js";
import { isPlusStore } from "../../../../../../../lib/storePlan.js";
import { logActivity } from "../../../../../../../lib/activityLog.js";

// Activate Storezn+ for a store that paid outside the platform (bank
// transfer, cash - an agreement done off-Paystack). The amount is
// written to the same store_subscription_transactions ledger every real
// charge lands in, so platform subscription revenue stays complete, and
// Plus is granted for `months` with planCancelled=true so it auto-lapses
// to free when the paid term ends (getEffectivePlan, lib/storePlan.js) -
// there's no card on file to renew it.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  // A live card subscription renews itself at Paystack - stacking a
  // manual term on top would double up and the planCancelled flag would
  // misrepresent it. Handle that one through Paystack / the vendor's own
  // /vendor/plus page instead.
  if (store.paystackSubscriptionCode && !store.planCancelled) {
    return NextResponse.json(
      { error: "This store has an active card subscription. Cancel that first, or adjust it in Paystack." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(manualPlusActivationSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { amount, months, plan, paidAt, note } = result.data;

  const now = new Date();
  // Stack onto whatever Plus time is left rather than shortening it.
  const from = isPlusStore(store) && store.planRenewsAt && new Date(store.planRenewsAt) > now
    ? new Date(store.planRenewsAt)
    : now;
  const planRenewsAt = new Date(from);
  planRenewsAt.setMonth(planRenewsAt.getMonth() + months);

  const updated = await db.transaction(async (tx) => {
    await tx.insert(storeSubscriptionTransactions).values({
      storeId: id,
      amount,
      // Not a real Paystack reference - the column is really "external
      // payment reference", and this keeps the unique constraint happy
      // while marking the row as an off-platform payment.
      paystackReference: `MANUAL-${crypto.randomUUID()}`,
      paidAt: paidAt || now,
    });
    const [row] = await tx
      .update(stores)
      .set({ plan, planCancelled: true, planRenewsAt })
      .where(eq(stores.id, id))
      .returning();
    return row;
  });

  await logActivity({
    user,
    action: "store.manual_plus",
    targetType: "store",
    targetId: id,
    metadata: { amount, months, plan, note: note || null, planRenewsAt: planRenewsAt.toISOString() },
  });

  return NextResponse.json({ store: updated, planRenewsAt });
}
