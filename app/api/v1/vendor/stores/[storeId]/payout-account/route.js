import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, linkPayoutAccountSchema } from "../../../../../../../lib/validate.js";
import { getBanks, ensureSubAccount } from "../../../../../../../lib/paystack.js";

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const banks = await getBanks();
    return NextResponse.json({ banks });
  } catch (err) {
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
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const [updated] = await db
      .update(stores)
      .set({
        bankCode,
        bankName: bankName || null,
        accountNumber,
        accountName: subAccount.accountName,
        subAccountCode: subAccount.subAccountCode,
      })
      .where(eq(stores.id, storeId))
      .returning();

    return NextResponse.json({ store: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not verify that account" }, { status: 502 });
  }
}
