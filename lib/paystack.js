import crypto from "crypto";

const BASE_URL = "https://api.paystack.co";
const SUBACCOUNT_CODE_PATTERN = /^ACCT_[A-Za-z0-9]+$/;

function headers() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

// Paystack's default cut on a sub-account when a transaction doesn't
// override it with its own transaction_charge (every transaction we
// create always does, see initializeTransaction), so this is never
// actually relied on, it's set purely to satisfy the required field.
const DEFAULT_PERCENTAGE_CHARGE = 20;

// amount and split.amount are in Naira (not kobo), converted to kobo here,
// at the API boundary, so the rest of the app never has to think in kobo.
// `plan` (a Paystack plan_code) is how a Storezn+ subscribe transaction
// piggybacks on this same call - passing it makes Paystack auto-create
// and auto-renew a subscription off the first successful charge, no
// separate "create subscription" call needed. `metadata` is echoed back
// verbatim on the charge.success webhook, used there to attribute a
// subscription payment back to a store without parsing the reference.
export async function initializeTransaction({ amount, email, name, reference, redirectUrl, split, plan, metadata }) {
  const res = await fetch(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      amount: String(Math.round(amount * 100)),
      reference,
      currency: "NGN",
      callback_url: redirectUrl,
      ...(plan ? { plan } : {}),
      ...(metadata ? { metadata } : {}),
      // "bearer: account" keeps Paystack's own transaction fee on the
      // platform's main account, so the vendor nets exactly split.amount
      // (their commission-adjusted payout), not split.amount minus
      // Paystack's cut.
      ...(split
        ? {
            subaccount: split.subAccountCode,
            transaction_charge: Math.round((amount - split.amount) * 100),
            bearer: "account",
          }
        : {}),
    }),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to initialize payment");
  }
  const authorizationUrl = data.data?.authorization_url;
  try {
    new URL(authorizationUrl);
  } catch {
    throw new Error("Paystack returned an invalid payment link");
  }
  return { authorizationUrl, reference: data.data.reference };
}

// Normalizes Paystack's transaction status into the shape the webhook
// and storefront order-status checks expect: paymentStatus of
// "PAID"/"FAILED"/"PENDING", amountPaid in Naira. Paystack only sends
// regular transaction webhooks for successful charges, so abandoned or
// cancelled checkout attempts are discovered by Verify Transaction.
export async function verifyTransaction(reference) {
  const res = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to verify payment");
  }
  const { status, amount, gateway_response: gatewayResponse, message } = data.data;
  const failedStatuses = new Set(["abandoned", "failed", "reversed"]);
  const paymentStatus = status === "success" ? "PAID" : failedStatuses.has(status) ? "FAILED" : "PENDING";
  return { paymentStatus, amountPaid: amount / 100, status, gatewayResponse, message };
}

async function findSubAccount({ bankCode, accountNumber }) {
  const res = await fetch(`${BASE_URL}/subaccount?perPage=100`, { headers: headers() });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to list sub-accounts");
  }
  return data.data.find((s) => s.settlement_bank === bankCode && s.account_number === accountNumber);
}

async function createSubAccount({ bankCode, accountNumber, email, businessName }) {
  const res = await fetch(`${BASE_URL}/subaccount`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: DEFAULT_PERCENTAGE_CHARGE,
      primary_contact_email: email,
    }),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to create sub-account");
  }
  return data.data;
}

// Paystack doesn't reject a duplicate sub-account create for the same
// bank account, it just creates another one, so idempotency here means
// checking first rather than recovering from a create error.
//
// Returns both subAccountCode ("ACCT_..." - what checkout's split param
// needs, see initializeTransaction) and subAccountId (the numeric id) -
// the two are NOT interchangeable. listSettlements' `subaccount` filter
// (see lib/settlementSync.js) needs the numeric id; passing the code
// string there silently matched nothing, which was quietly breaking
// settlement-status checking for every store.
export async function ensureSubAccount({ bankCode, accountNumber, email }) {
  const existing = await findSubAccount({ bankCode, accountNumber });
  if (existing) {
    return { subAccountCode: existing.subaccount_code, subAccountId: existing.id, bankCode, accountNumber, accountName: existing.account_name, email };
  }
  const { accountName } = await resolveAccountName({ accountNumber, bankCode });
  const subAccount = await createSubAccount({ bankCode, accountNumber, email, businessName: accountName });
  return { subAccountCode: subAccount.subaccount_code, subAccountId: subAccount.id, bankCode, accountNumber, accountName, email };
}

// Backfill helper for stores that linked a payout account before
// subAccountId was tracked - looks the numeric id up by the code we
// already have, see syncStoreSettlements.
export async function getSubAccount(idOrCode) {
  const res = await fetch(`${BASE_URL}/subaccount/${idOrCode}`, { headers: headers() });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to fetch sub-account");
  return data.data;
}

export function isValidSubAccountCode(code) {
  return SUBACCOUNT_CODE_PATTERN.test(code || "");
}

export async function getBanks() {
  const res = await fetch(`${BASE_URL}/bank?country=nigeria&currency=NGN&type=nuban`, { headers: headers() });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to fetch bank list");
  }
  // Paystack's bank list can list the same institution's code more than
  // once (e.g. a legacy + current entry), dedupe by code so it's safe to
  // use directly as a React list key (bank picker UI).
  const seen = new Set();
  const banks = [];
  for (const b of data.data) {
    if (seen.has(b.code)) continue;
    seen.add(b.code);
    banks.push({ name: b.name, code: b.code });
  }
  return banks;
}

export async function resolveAccountName({ accountNumber, bankCode }) {
  const res = await fetch(
    `${BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: headers() },
  );
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Could not resolve account name");
  }
  return { accountNumber: data.data.account_number, accountName: data.data.account_name, bankCode };
}

// Lists settlement batches for a sub-account (or the main account if
// omitted) - used to find out whether a given order's split has actually
// paid out yet, see lib/settlementSync.js. `from` is a "YYYY-MM-DD" date
// string.
export async function listSettlements({ subaccount, from } = {}) {
  const params = new URLSearchParams({ perPage: "50" });
  if (subaccount) params.set("subaccount", subaccount);
  if (from) params.set("from", from);
  const res = await fetch(`${BASE_URL}/settlement?${params}`, { headers: headers() });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to fetch settlements");
  return data.data;
}

// The individual transactions bundled into one settlement batch - each
// carries the same `reference` we sent as paymentReference at
// initializeTransaction, which is how syncStoreSettlements matches a
// settlement back to specific orders.
export async function getSettlementTransactions(settlementId) {
  const res = await fetch(`${BASE_URL}/settlement/${settlementId}/transactions?perPage=100`, { headers: headers() });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to fetch settlement transactions");
  return data.data;
}

// Storezn+ subscription plan - created once (paystackPlanCode is then
// persisted on platformSettings), amount kept in sync via updatePlan
// whenever the admin edits plusMonthlyPrice. See PATCH
// /api/v1/super-admin/settings.
export async function createPlan({ name, amount, interval = "monthly" }) {
  const res = await fetch(`${BASE_URL}/plan`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, amount: Math.round(amount * 100), interval, currency: "NGN" }),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to create plan");
  return { planCode: data.data.plan_code };
}

export async function updatePlan(planCode, { amount, updateExistingSubscriptions }) {
  const body = { amount: Math.round(amount * 100) };
  if (typeof updateExistingSubscriptions === "boolean") {
    body.update_existing_subscriptions = updateExistingSubscriptions;
  }
  const res = await fetch(`${BASE_URL}/plan/${encodeURIComponent(planCode)}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to update plan");
}

// Requires both the subscription code and its "email token" - Paystack's
// own anti-tamper requirement, neither alone is enough. Both are captured
// off the subscription.create webhook event, see
// stores.paystackSubscriptionCode/paystackSubscriptionToken.
export async function disableSubscription({ code, token }) {
  const res = await fetch(`${BASE_URL}/subscription/disable`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, token }),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to cancel subscription");
}

// Paystack signs webhook bodies with SHA512 HMAC of the raw JSON body using
// the secret key (no separate webhook secret). Verify before trusting any
// webhook payload.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(hash, "hex");
  const received = Buffer.from(signatureHeader, "hex");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}
