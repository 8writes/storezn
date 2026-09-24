import test from "node:test";
import assert from "node:assert/strict";
import { canFinalizeCheckoutAttemptPaymentStatus } from "../lib/checkoutAttempts.js";

test("verified paid checkout attempts can recover after reservation release", () => {
  assert.equal(canFinalizeCheckoutAttemptPaymentStatus("pending"), true);
  assert.equal(canFinalizeCheckoutAttemptPaymentStatus("failed"), false);
  assert.equal(canFinalizeCheckoutAttemptPaymentStatus("failed", { recoverReleasedStock: true }), true);
  assert.equal(canFinalizeCheckoutAttemptPaymentStatus("paid", { recoverReleasedStock: true }), false);
});
