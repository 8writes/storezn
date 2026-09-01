import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { stores, orders } from "../../../../../../lib/db/schema.js";
import { desc, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { validate, updateStoreStatusSchema } from "../../../../../../lib/validate.js";
import { logActivity } from "../../../../../../lib/activityLog.js";
import { createPlan, updatePlan } from "../../../../../../lib/paystack.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const store = await db.query.stores.findFirst({ where: eq(stores.id, id), with: { owner: true } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.storeId, id))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  const { owner, ...storeData } = store;
  return NextResponse.json({
    store: storeData,
    owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone } : null,
    transactions: orderRows.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      amount: o.totalAmount,
      commission: o.commissionAmount + (o.flatFeeAmount || 0),
      status: o.paymentStatus === "paid" ? o.status : o.paymentStatus,
    })),
  });
}

// Manual enable/disable (for policy violations - there's no "unpaid
// invoice" auto-disable in this platform, since commission is deducted
// at the payment gateway per transaction, not billed after the fact)
// and per-store commission-rate override.
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateStoreStatusSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const data = { ...result.data };

  if (data.isActive === true) data.disabledReason = null;
  if (data.isActive === false) data.disabledReason = "manual";

  // A custom Storezn+ price needs its own Paystack Plan - Paystack renews
  // a subscription at its PLAN's amount, not the `amount` the initialize
  // call sent, so on the shared plan an overridden store would just renew
  // at platformSettings.plusMonthlyPrice. Provision/adjust that plan here
  // so subscribe/route.js can point new subscriptions at it. (An
  // already-active subscription keeps whatever plan it was created on -
  // the vendor re-subscribes to pick up a changed price.)
  if ("subscriptionPriceOverride" in data) {
    try {
      if (data.subscriptionPriceOverride == null) {
        data.paystackPlanCodeOverride = null;
      } else if (store.paystackPlanCodeOverride) {
        await updatePlan(store.paystackPlanCodeOverride, { amount: data.subscriptionPriceOverride });
      } else {
        const { planCode } = await createPlan({
          name: `Storezn+ - ${store.name}`.slice(0, 100),
          amount: data.subscriptionPriceOverride,
        });
        data.paystackPlanCodeOverride = planCode;
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Couldn't set the custom price with Paystack: ${err.message || "try again"}` },
        { status: 502 },
      );
    }
  }

  if (data.unlockPayoutAccount) {
    delete data.unlockPayoutAccount;
    data.bankCode = null;
    data.bankName = null;
    data.accountNumber = null;
    data.accountName = null;
    data.subAccountCode = null;
  }

  const [updated] = await db.update(stores).set(data).where(eq(stores.id, id)).returning();

  await logActivity({ user, action: "store.update", targetType: "store", targetId: id, metadata: data });

  return NextResponse.json({ store: updated });
}
