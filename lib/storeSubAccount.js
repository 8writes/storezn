import { db } from "./db/index.js";
import { stores } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { getSubAccount, isValidSubAccountCode } from "./paystack.js";
import { logAppError } from "./appErrorLog.js";

// The Paystack sub-account a store's share is split to. Shared by every
// flow that takes money for a store - storefront checkout and invoice
// payment - because "no valid sub-account" has to mean the same thing in
// both: refuse the payment. An unsplit charge is not a smaller problem
// than a failed one; the whole amount lands in the platform's main
// account with nothing tying it back to the vendor, and the vendor is
// simply never paid.
//
// Some older stores carry only the numeric subAccountId (or a code that
// no longer validates), so this repairs the row from Paystack once rather
// than failing a sale forever - see the ensureSubAccount comment in
// lib/paystack.js for why the id and the code are not interchangeable.
export async function resolveStoreSubAccountCode(store, { source = "payment" } = {}) {
  if (isValidSubAccountCode(store.subAccountCode)) return store.subAccountCode;

  const lookupKey = store.subAccountId || store.subAccountCode;
  if (!lookupKey) return null;

  try {
    const subAccount = await getSubAccount(lookupKey);
    if (!isValidSubAccountCode(subAccount?.subaccount_code)) return null;

    await db
      .update(stores)
      .set({ subAccountCode: subAccount.subaccount_code, subAccountId: subAccount.id, updatedAt: new Date() })
      .where(eq(stores.id, store.id));
    return subAccount.subaccount_code;
  } catch (err) {
    console.error(`${source}: failed to repair Paystack sub-account`, {
      storeId: store.id,
      subAccountId: store.subAccountId || null,
      subAccountCode: store.subAccountCode || null,
      error: err.message,
    });
    await logAppError(err, {
      source: `${source}.subaccount_repair`,
      storeId: store.id,
      metadata: { subAccountId: store.subAccountId || null, hasSubAccountCode: !!store.subAccountCode },
    });
    return null;
  }
}

// One wording for both flows, so a buyer sees the same thing whether they
// hit it on a cart checkout or an invoice link.
export const SUBACCOUNT_UNAVAILABLE_MESSAGE =
  "This store's payment setup needs attention. Please contact the seller to relink their payout account.";
