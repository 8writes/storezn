import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, platformSettings, users } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { initializeTransaction, updatePlan } from "../../../../../../../lib/paystack.js";
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
  // A super_admin-set discount for this store (see /api/v1/super-admin/
  // stores/[id]) wins over the platform-wide price. It also gets its own
  // Paystack Plan (paystackPlanCodeOverride) - Paystack renews at the
  // plan's amount, so a discounted store on the shared plan would renew
  // at the full plusMonthlyPrice. `amount` and `plan` are resolved
  // together so they always match.
  const amount = getPlusMonthlyPrice(store, settings);
  const planCode = store.paystackPlanCodeOverride ?? settings.paystackPlanCode;
  const redirectUrl = resolveSubscriptionRedirectUrl(req, body.redirectUrl);

  try {
    // Percentage discounts follow the current platform price. Refresh the
    // dedicated plan immediately before a new subscription so a later base
    // price change cannot make Paystack charge a stale amount.
    if (store.subscriptionDiscountPercent != null && store.paystackPlanCodeOverride) {
      await updatePlan(store.paystackPlanCodeOverride, {
        amount,
        updateExistingSubscriptions: false,
      });
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
