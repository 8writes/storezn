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
