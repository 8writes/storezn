import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../lib/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { validate, linkPayoutAccountSchema } from "../../../../../../../lib/validate.js";
import { getBanks, ensureSubAccount } from "../../../../../../../lib/paystack.js";
import { sendPushToRole } from "../../../../../../../lib/push.js";
import { logAppError } from "../../../../../../../lib/appErrorLog.js";
import { withApiMonitoring } from "../../../../../../../lib/apiMonitoring.js";

async function handleGet(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const banks = await getBanks();
    return NextResponse.json({ banks });
  } catch (err) {
    await logAppError(err, { req, user, source: "payout_account.banks", statusCode: 502, storeId });
    return NextResponse.json({ error: err.message || "Could not load bank list" }, { status: 502 });
  }
}

// The vendor only ever supplies bankCode + accountNumber - Paystack's
// sub-account create call itself validates the pair and resolves the
// account holder's name, so there's nothing here for a vendor to fake or
// typo their way past. No split percentage is stored on the sub-account:
// checkout (see lib/paystack.js's initializeTransaction) sends the exact
// vendorPayoutAmount computed per order, so a later commission rate
// change never requires touching the sub-account itself.
async function handlePost(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Locked once set - matches the UI, which hides the form entirely once
  // a payout account exists. A vendor who wants to change banks has to go
  // through support (see super-admin's "Unlock payout account" action),
  // not resubmit this form - a bad actor with a stolen session shouldn't
  // be able to silently redirect future payouts.
  if (store.subAccountCode) {
    return NextResponse.json({ error: "A payout account is already linked. Contact support to change it." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(linkPayoutAccountSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { bankCode, accountNumber } = result.data;

  try {
    const banks = await getBanks();
    const bankName = banks.find((b) => b.code === bankCode)?.name;
    // Idempotent: reuses an existing sub-account for this exact
    // bank/account pair rather than creating a duplicate, so a vendor
    // re-linking the same account (or the platform retrying after a
    // failure) is safe.
    const subAccount = await ensureSubAccount({ bankCode, accountNumber, email: user.email });

    // Guarded on subAccountCode still being null - closes the window
    // between the check above and here, so two concurrent submits (e.g. a
    // stolen session trying two different accounts) can't have the second
    // one overwrite the first's linked account.
    const [updated] = await db
      .update(stores)
      .set({
        bankCode,
        bankName: bankName || null,
        accountNumber,
        accountName: subAccount.accountName,
        subAccountCode: subAccount.subAccountCode,
        subAccountId: subAccount.subAccountId,
      })
      .where(and(eq(stores.id, storeId), isNull(stores.subAccountCode)))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "A payout account is already linked. Contact support to change it." }, { status: 409 });
    }

    // Informational only - the sub-account is already live on Paystack by
    // this point (ensureSubAccount above), this just flags it for a human
    // to review/approve in the Paystack dashboard. A failed push shouldn't
    // fail the vendor's request, so this is fire-and-forget.
    sendPushToRole("super_admin", {
      title: "New payout account linked",
      body: `${updated.name} linked ***${accountNumber.slice(-4)} at ${bankName || bankCode} (${subAccount.accountName})`,
      url: `/super-admin/stores/${storeId}`,
    }).catch((err) => console.error("payout-account: admin push failed", err));

    return NextResponse.json({ store: updated });
  } catch (err) {
    await logAppError(err, {
      req,
      user,
      source: "payout_account.link",
      statusCode: 502,
      storeId,
      metadata: { bankCode, accountLast4: accountNumber.slice(-4) },
    });
    return NextResponse.json({ error: err.message || "Could not verify that account" }, { status: 502 });
  }
}

export const GET = withApiMonitoring(handleGet, { source: "vendor.payout_account.banks" });
export const POST = withApiMonitoring(handlePost, { source: "vendor.payout_account.link" });
