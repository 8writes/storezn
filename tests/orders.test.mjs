import test from "node:test";
import assert from "node:assert/strict";
import { computeOrderTotals } from "../lib/orders.js";

const base = {
  subtotal: 10_000,
  shippingFee: 1_000,
  commissionRatePercent: 5,
  flatFee: 500,
};

// The percentage is on items + shipping (₦11,000 here), because Paystack
// takes its own percentage on the whole amount charged, delivery included.
test("flat fee is deducted from the vendor payout when the vendor absorbs payment processing fees", () => {
  assert.deepEqual(computeOrderTotals({ ...base, feeChargedToCustomer: false }), {
    totalAmount: 11_000,
    commissionAmount: 550,
    flatFeeAmount: 500,
    platformFeeAmount: 1_050,
    vendorPayoutAmount: 9_950,
  });
});

test("flat fee is added to the customer charge when the customer pays payment processing fees", () => {
  assert.deepEqual(computeOrderTotals({ ...base, feeChargedToCustomer: true }), {
    totalAmount: 12_050,
    commissionAmount: 550,
    flatFeeAmount: 500,
    platformFeeAmount: 1_050,
    vendorPayoutAmount: 11_000,
  });
});

test("the percentage covers shipping too, and shipping still goes to the vendor in full", () => {
  const withShipping = computeOrderTotals({ subtotal: 100_000, shippingFee: 5_000, commissionRatePercent: 3.9, flatFee: 100, feeChargedToCustomer: true });
  assert.equal(withShipping.commissionAmount, 4_095); // 3.9% of ₦105,000
  assert.equal(withShipping.vendorPayoutAmount, 105_000); // items + full shipping
  // No shipping: unchanged from before.
  const noShipping = computeOrderTotals({ subtotal: 100_000, shippingFee: 0, commissionRatePercent: 3.9, flatFee: 100, feeChargedToCustomer: true });
  assert.equal(noShipping.commissionAmount, 3_900);
});

test("a 50/50 invoice deposit includes half of customer-paid percentage and flat fees", () => {
  const totals = computeOrderTotals({ ...base, shippingFee: 0, feeChargedToCustomer: true });

  assert.equal(totals.totalAmount, 11_000);
  assert.equal(Math.round(totals.totalAmount * 50) / 100, 5_500);
  assert.equal(totals.vendorPayoutAmount, 10_000);
});

test("an absorbed invoice fee does not increase the customer total", () => {
  const totals = computeOrderTotals({ ...base, shippingFee: 0, feeChargedToCustomer: false });

  assert.equal(totals.totalAmount, 10_000);
  assert.equal(totals.vendorPayoutAmount, 9_000);
});
