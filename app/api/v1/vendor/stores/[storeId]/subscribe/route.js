import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, platformSettings, users } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { createPlan, initializeTransaction, updatePlan } from "../../../../../../../lib/paystack.js";
import { isPlusStore, isEnterpriseStore, getPlusMonthlyPrice } from "../../../../../../../lib/storePlan.js";
import { buildRequestUrl, getRequestOrigin } from "../../../../../../../lib/requestUrl.js";
import { logAppError } from "../../../../../../../lib/appErrorLog.js";
import { withApiMonitoring } from "../../../../../../../lib/apiMonitoring.js";

const nanoid = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

function resolveSubscriptionRedirectUrl(req, requestedUrl) {
  const fallbackUrl = buildRequestUrl(req, "/vendor/plus");
  if (!fallbackUrl || !requestedUrl) return fallbackUrl;

  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) return fallbackUrl;

  try {
    const resolvedUrl = new URL(requestedUrl, requestOrigin);
    if (resolvedUrl.origin !== requestOrigin) return fallbackUrl;
    return resolvedUrl.toString();
  } catch {
    return fallbackUrl;
  }
}

// Starts (or restarts, if planCancelled) a Storezn+ subscription -
// owner-only, same as the payout account (isStoreOwner, not
// canManageStore). The subscription itself doesn't get created until
// Paystack confirms the first charge (see the "STOREZNSUB-" branch of
// POST /api/v1/webhooks/paystack) - this just kicks off that payment.
async function handlePost(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isEnterpriseStore(store)) {
    return NextResponse.json({ error: "This store is on Storezn Enterprise, which already includes Storezn+" }, { status: 400 });
  }
  if (isPlusStore(store)) {
    return NextResponse.json({ error: "This store is already on Storezn+" }, { status: 400 });
  }

  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  if (!settings?.paystackPlanCode) {
    return NextResponse.json({ error: "Storezn+ isn't available yet - try again shortly" }, { status: 503 });
  }

  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, store.ownerId)).limit(1);

  const body = await req.json().catch(() => ({}));
  const reference = `STOREZNSUB-${nanoid()}`;
  let amount = getPlusMonthlyPrice(store, settings);
  // A negotiated recurring price is already an explicit exception to the
  // platform price and must not be replaced by an introductory campaign.
  const hasNegotiatedPrice = store.subscriptionPriceOverride != null && store.subscriptionDiscountPercent == null;
  const discountPercent = hasNegotiatedPrice ? null : settings.plusIntroDiscountPercent;
  let planCode = store.paystackPlanCodeOverride ?? settings.paystackPlanCode;
  const redirectUrl = resolveSubscriptionRedirectUrl(req, body.redirectUrl);

  try {
    // Every discounted signup gets an isolated plan. The webhook restores
    // this plan to the standard price after the first successful charge;
    // sharing one discounted plan would alter every subscriber together.
    if (discountPercent != null) {
      if (!store.paystackPlanCodeOverride) {
        const created = await createPlan({ name: `Storezn+ - ${store.name}`.slice(0, 100), amount });
        planCode = created.planCode;
      } else {
        await updatePlan(store.paystackPlanCodeOverride, { amount, updateExistingSubscriptions: false });
      }
      await db.update(stores).set({
        paystackPlanCodeOverride: planCode,
        subscriptionDiscountPercent: discountPercent,
        subscriptionPriceOverride: amount,
      }).where(eq(stores.id, storeId));
    } else if (store.subscriptionDiscountPercent != null && store.paystackPlanCodeOverride) {
      // Promotion was disabled after this store opened checkout but before
      // it paid. Restore its dedicated plan so a retry cannot use stale pricing.
      await updatePlan(store.paystackPlanCodeOverride, { amount: settings.plusMonthlyPrice, updateExistingSubscriptions: false });
      await db.update(stores).set({ subscriptionDiscountPercent: null, subscriptionPriceOverride: null }).where(eq(stores.id, storeId));
      amount = settings.plusMonthlyPrice;
    }
    const { authorizationUrl } = await initializeTransaction({
      amount,
      email: owner.email,
      reference,
      redirectUrl,
      plan: planCode,
      metadata: { storeId },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    await logAppError(err, {
      req,
      user,
      source: "subscription.initialize_payment",
      statusCode: 502,
      storeId,
      metadata: { reference, amount, planCode },
    });
    return NextResponse.json({ error: err.message || "Failed to start subscription" }, { status: 502 });
  }
}

export const POST = withApiMonitoring(handlePost, { source: "vendor.subscription.start" });
