import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import {
  stores,
  orders,
  products,
  staff,
  branches,
  customers,
  posRegisters,
  posSessions,
  storeActivityLogs,
  activityLogs,
  storeSubscriptionTransactions,
  platformSettings,
} from "../../../../../../lib/db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
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

  const [
    orderRows,
    subRows,
    [orderAgg],
    [prodAgg],
    [staffAgg],
    [branchAgg],
    [custAgg],
    [posAgg],
    activityRows,
    adminRows,
  ] = await Promise.all([
    db.select().from(orders).where(eq(orders.storeId, id)).orderBy(desc(orders.createdAt)).limit(20),
    db
      .select()
      .from(storeSubscriptionTransactions)
      .where(eq(storeSubscriptionTransactions.storeId, id))
      .orderBy(desc(storeSubscriptionTransactions.paidAt))
      .limit(50),
    // Lifetime money + order picture. "paid" and not refunded, same basis
    // as payouts / the vendor dashboard; returns (originalOrderId set) are
    // excluded from the order count but their negative totals still net
    // out of GMV/payout so the figures match what the vendor was paid.
    db
      .select({
        total: sql`count(*) filter (where ${orders.paymentStatus} = 'paid' and ${orders.status} <> 'refunded' and ${orders.originalOrderId} is null)`.mapWith(Number),
        pending: sql`count(*) filter (where ${orders.status} in ('processing', 'shipped'))`.mapWith(Number),
        refunds: sql`count(*) filter (where ${orders.originalOrderId} is not null)`.mapWith(Number),
        gmv: sql`coalesce(sum(${orders.totalAmount}) filter (where ${orders.paymentStatus} = 'paid' and ${orders.status} <> 'refunded'), 0)`.mapWith(Number),
        payout: sql`coalesce(sum(${orders.vendorPayoutAmount}) filter (where ${orders.paymentStatus} = 'paid' and ${orders.status} <> 'refunded'), 0)`.mapWith(Number),
        commission: sql`coalesce(sum(${orders.commissionAmount} + coalesce(${orders.flatFeeAmount}, 0)) filter (where ${orders.paymentStatus} = 'paid' and ${orders.status} <> 'refunded'), 0)`.mapWith(Number),
        firstAt: sql`min(${orders.createdAt})`,
        lastAt: sql`max(${orders.createdAt})`,
      })
      .from(orders)
      .where(eq(orders.storeId, id)),
    db
      .select({
        total: sql`count(*)`.mapWith(Number),
        live: sql`count(*) filter (where ${products.isActive})`.mapWith(Number),
      })
      .from(products)
      .where(eq(products.storeId, id)),
    db.select({ total: sql`count(*)`.mapWith(Number) }).from(staff).where(eq(staff.storeId, id)),
    db.select({ total: sql`count(*)`.mapWith(Number) }).from(branches).where(eq(branches.storeId, id)),
    db
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(eq(customers.storeId, id), isNull(customers.deletedAt))),
    db
      .select({
        registers: sql`count(distinct ${posRegisters.id})`.mapWith(Number),
        openSessions: sql`count(*) filter (where ${posSessions.status} = 'open')`.mapWith(Number),
        lastSessionAt: sql`max(${posSessions.openedAt})`,
      })
      .from(posRegisters)
      .leftJoin(posSessions, eq(posSessions.registerId, posRegisters.id))
      .where(eq(posRegisters.storeId, id)),
    // The store's own audit trail (lib/storeActivity.js) - the same feed
    // the owner sees at /vendor/activity, newest first.
    db
      .select({ log: storeActivityLogs, branchName: branches.name })
      .from(storeActivityLogs)
      .leftJoin(branches, eq(branches.id, storeActivityLogs.branchId))
      .where(eq(storeActivityLogs.storeId, id))
      .orderBy(desc(storeActivityLogs.createdAt))
      .limit(25),
    // Platform-team actions taken ON this store (enable/disable, manual
    // plan grants, price/rate overrides, payout unlock).
    db
      .select()
      .from(activityLogs)
      .where(and(eq(activityLogs.targetType, "store"), eq(activityLogs.targetId, id)))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20),
  ]);

  const { owner, ...storeData } = store;
  return NextResponse.json({
    store: storeData,
    owner: owner
      ? {
          id: owner.id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
          phone: owner.phone,
          approvalStatus: owner.approvalStatus,
          lastActiveAt: owner.lastActiveAt,
          createdAt: owner.createdAt,
        }
      : null,
    stats: {
      orders: {
        total: orderAgg?.total || 0,
        pending: orderAgg?.pending || 0,
        refunds: orderAgg?.refunds || 0,
      },
      gmv: orderAgg?.gmv || 0,
      payout: orderAgg?.payout || 0,
      commission: orderAgg?.commission || 0,
      firstOrderAt: orderAgg?.firstAt || null,
      lastOrderAt: orderAgg?.lastAt || null,
      products: { total: prodAgg?.total || 0, live: prodAgg?.live || 0 },
      staff: staffAgg?.total || 0,
      branches: branchAgg?.total || 0,
      customers: custAgg?.total || 0,
      pos: {
        registers: posAgg?.registers || 0,
        openSessions: posAgg?.openSessions || 0,
        lastSessionAt: posAgg?.lastSessionAt || null,
      },
    },
    storeActivity: activityRows.map((r) => ({
      id: r.log.id,
      action: r.log.action,
      summary: r.log.summary,
      actorName: r.log.actorName,
      actorRole: r.log.actorRole,
      branchName: r.branchName || null,
      createdAt: r.log.createdAt,
    })),
    adminActivity: adminRows.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorName,
      actorRole: a.actorRole,
      metadata: a.metadata,
      createdAt: a.createdAt,
    })),
    transactions: orderRows.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      amount: o.totalAmount,
      commission: o.commissionAmount + (o.flatFeeAmount || 0),
      status: o.paymentStatus === "paid" ? o.status : o.paymentStatus,
      channel: o.channel,
      isReturn: !!o.originalOrderId,
    })),
    subscriptionTransactions: subRows.map((s) => ({
      id: s.id,
      amount: s.amount,
      paidAt: s.paidAt,
      reference: s.paystackReference,
      manual: s.paystackReference?.startsWith("MANUAL-") || false,
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

  // A percentage discount is converted to an explicit monthly price here.
  // Keeping that amount beside the percentage makes both Paystack renewals
  // and the amount shown to the vendor deterministic.
  if ("subscriptionDiscountPercent" in data) {
    if (data.subscriptionDiscountPercent == null) {
      if (!("subscriptionPriceOverride" in data)) data.subscriptionPriceOverride = null;
    } else {
      const [settings] = await db
        .select({ plusMonthlyPrice: platformSettings.plusMonthlyPrice })
        .from(platformSettings)
        .where(eq(platformSettings.id, "singleton"))
        .limit(1);
      const basePrice = settings?.plusMonthlyPrice ?? 5000;
      data.subscriptionPriceOverride = Math.round(basePrice * (1 - data.subscriptionDiscountPercent / 100) * 100) / 100;
    }
  } else if ("subscriptionPriceOverride" in data) {
    // A manually entered fixed price replaces any percentage discount.
    data.subscriptionDiscountPercent = null;
  }

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
        // An active subscription created with a one-month offer remains on
        // its dedicated plan; retain the code so future platform price
        // changes can keep that renewal amount in sync.
        if (!store.paystackSubscriptionCode) data.paystackPlanCodeOverride = null;
      } else if (store.paystackPlanCodeOverride) {
        await updatePlan(store.paystackPlanCodeOverride, {
          amount: data.subscriptionPriceOverride,
          updateExistingSubscriptions: false,
        });
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
