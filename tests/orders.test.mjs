import test from "node:test";
import assert from "node:assert/strict";
import { computeOrderTotals } from "../lib/orders.js";

const base = {
  subtotal: 10_000,
  shippingFee: 1_000,
  commissionRatePercent: 5,
  flatFee: 500,
};

test("flat fee is deducted from the vendor payout when the vendor absorbs platform fees", () => {
  assert.deepEqual(computeOrderTotals({ ...base, feeChargedToCustomer: false }), {
    totalAmount: 11_000,
    commissionAmount: 500,
    flatFeeAmount: 500,
    platformFeeAmount: 1_000,
    vendorPayoutAmount: 10_000,
  });
});

test("flat fee is added to the customer charge when the customer pays platform fees", () => {
  assert.deepEqual(computeOrderTotals({ ...base, feeChargedToCustomer: true }), {
    totalAmount: 12_000,
    commissionAmount: 500,
    flatFeeAmount: 500,
    platformFeeAmount: 1_000,
    vendorPayoutAmount: 11_000,
  });
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
