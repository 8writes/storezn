import test from "node:test";
import assert from "node:assert/strict";
import { INTERNATIONAL_CHANNELS, resolveFeePolicy } from "../lib/feePolicy.js";
import { computeOrderTotals } from "../lib/orders.js";

const settings = {
  defaultCommissionRatePercent: 5,
  maxCommissionAmount: null,
  defaultFlatFee: 0,
  intlCommissionRatePercent: 3.9,
  intlMaxCommissionAmount: null,
  intlFlatFee: 100,
};
const intlStore = { internationalPaymentsEnabled: true, feeChargedToCustomer: true, commissionRatePercent: null };
const localStore = { internationalPaymentsEnabled: false, feeChargedToCustomer: true, commissionRatePercent: null };

test("international fees apply only when the store accepts them AND the customer chose a foreign card", () => {
  assert.equal(resolveFeePolicy({ store: intlStore, settings, international: true }).international, true);
  assert.equal(resolveFeePolicy({ store: intlStore, settings, international: false }).international, false);
  // A store with international off ignores the customer's choice entirely.
  assert.equal(resolveFeePolicy({ store: localStore, settings, international: true }).international, false);
});

test("only a real boolean true opts in", () => {
  for (const value of ["true", 1, "1", "yes", null, undefined]) {
    assert.equal(resolveFeePolicy({ store: intlStore, settings, international: value }).international, false, String(value));
  }
});

test("an international order uses the platform's international rate, cap and flat fee", () => {
  const policy = resolveFeePolicy({
    store: intlStore,
    settings: { ...settings, intlMaxCommissionAmount: 2000 },
    international: true,
  });
  assert.equal(policy.commissionRatePercent, 3.9);
  assert.equal(policy.flatFee, 100);
  assert.equal(policy.maxCommissionAmount, 2000);
  assert.deepEqual(policy.channels, INTERNATIONAL_CHANNELS);
});

test("a store's custom local rate never applies to an international order", () => {
  const store = { ...intlStore, commissionRatePercent: 2 };
  assert.equal(resolveFeePolicy({ store, settings, international: true }).commissionRatePercent, 3.9);
  // ...but still applies to that store's local orders.
  assert.equal(resolveFeePolicy({ store, settings, international: false }).commissionRatePercent, 2);
});

test("a local order uses the local settings and every payment method", () => {
  const policy = resolveFeePolicy({ store: localStore, settings, international: false });
  assert.equal(policy.commissionRatePercent, 5);
  assert.equal(policy.flatFee, 0);
  assert.equal(policy.channels, null);
});

test("international checkout offers card and Apple Pay only", () => {
  assert.deepEqual(INTERNATIONAL_CHANNELS, ["card", "apple_pay"]);
});

test("international pricing flows through the shared order maths", () => {
  // ₦10,000 subtotal, customer pays the fee: 3.9% = 390 + ₦100 = 490.
  const policy = resolveFeePolicy({ store: intlStore, settings, international: true });
  const totals = computeOrderTotals({
    subtotal: 10_000,
    shippingFee: 0,
    commissionRatePercent: policy.commissionRatePercent,
    flatFee: policy.flatFee,
    feeChargedToCustomer: policy.feeChargedToCustomer,
    maxCommissionAmount: policy.maxCommissionAmount,
  });
  assert.equal(totals.platformFeeAmount, 490);
  assert.equal(totals.totalAmount, 10_490);
  assert.equal(totals.vendorPayoutAmount, 10_000);
});

test("the international cap is respected", () => {
  const policy = resolveFeePolicy({
    store: intlStore,
    settings: { ...settings, intlMaxCommissionAmount: 2_000 },
    international: true,
  });
  const totals = computeOrderTotals({
    subtotal: 1_000_000,
    shippingFee: 0,
    commissionRatePercent: policy.commissionRatePercent,
    flatFee: policy.flatFee,
    feeChargedToCustomer: true,
    maxCommissionAmount: policy.maxCommissionAmount,
  });
  assert.equal(totals.platformFeeAmount, 2_000);
});

test("missing international settings fall back to Paystack's published 3.9% + ₦100", () => {
  const policy = resolveFeePolicy({ store: intlStore, settings: {}, international: true });
  assert.equal(policy.commissionRatePercent, 3.9);
  assert.equal(policy.flatFee, 100);
  assert.equal(policy.maxCommissionAmount, null);
});
