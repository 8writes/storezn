import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, platformSettings, users } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { initializeTransaction } from "../../../../../../../lib/paystack.js";
import { isPlusStore } from "../../../../../../../lib/storePlan.js";

const nanoid = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Starts (or restarts, if planCancelled) a Storezn+ subscription -
// owner-only, same as the payout account (isStoreOwner, not
// canManageStore). The subscription itself doesn't get created until
// Paystack confirms the first charge (see the "STOREZNSUB-" branch of
// POST /api/v1/webhooks/paystack) - this just kicks off that payment.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  try {
    const { authorizationUrl } = await initializeTransaction({
      amount: settings.plusMonthlyPrice,
      email: owner.email,
      reference,
      redirectUrl: body.redirectUrl,
      plan: settings.paystackPlanCode,
      metadata: { storeId },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to start subscription" }, { status: 502 });
  }
}
