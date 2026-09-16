import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionSummary, computeDrawer, validateTenders } from "../lib/pos.js";

test("split tenders must settle the total exactly", () => {
  assert.deepEqual(validateTenders([
    { method: "cash", amount: 4_000, changeGiven: 0 },
    { method: "card", amount: 6_000, changeGiven: 0 },
  ], 10_000), { ok: true });
  assert.equal(validateTenders([{ method: "cash", amount: 9_998 }], 10_000).ok, false);
});

test("non-cash overpayment remains gross in its account and cash change leaves the drawer", () => {
  const summary = buildSessionSummary({
    session: { openingFloat: 20_000, openedAt: new Date("2026-01-01T08:00:00Z") },
    orders: [{ totalAmount: 9_000, discountAmount: 0, originalOrderId: null, createdAt: new Date("2026-01-01T09:00:00Z") }],
    tenders: [{ method: "transfer", provider: "Opay", amount: 10_000, changeGiven: 1_000 }],
    movements: [{ kind: "change_out", amount: -1_000 }],
  });
  assert.equal(summary.byTenderMethod.transfer, 10_000);
  assert.equal(summary.byAccount[0].amount, 10_000);
  assert.equal(summary.nonCashChangeOut, 1_000);
  assert.equal(summary.drawer.expectedCash, 19_000);
});

test("opening float movement is not counted twice", () => {
  const drawer = computeDrawer(50_000, [
    { kind: "float", amount: 50_000 },
    { kind: "cash_sale", amount: 12_500 },
    { kind: "paid_out", amount: -2_000 },
  ]);
  assert.equal(drawer.expectedCash, 60_500);
});
