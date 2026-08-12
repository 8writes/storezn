import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../../lib/auth.js";
import { resolveAccountName } from "../../../../../../../../lib/paystack.js";

// Name-only lookup, called live as the vendor types (see the payouts
// page) so they can see who they're actually about to link before
// committing - unlike POST /payout-account, this never creates or
// touches a Paystack sub-account, it's read-only.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select({ id: stores.id, ownerId: stores.ownerId }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bankCode = body?.bankCode;
  const accountNumber = body?.accountNumber;
  if (!bankCode || !accountNumber || accountNumber.length !== 10) {
    return NextResponse.json({ error: "Select a bank and enter a 10-digit account number" }, { status: 400 });
  }

  try {
    const { accountName } = await resolveAccountName({ accountNumber, bankCode });
    return NextResponse.json({ accountName });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not resolve account name" }, { status: 400 });
  }
}
