import test from "node:test";
import assert from "node:assert/strict";
import { OPENING_BASIS, buildSessionSummary, canReplayOfflineSale, computeDrawer, openingBasisOf, posPriceAdjustmentPolicy, resolveCloseCount, splitCountBreakdown, validateTenders } from "../lib/pos.js";

test("split tenders must settle the total exactly", () => {
  assert.deepEqual(validateTenders([
    { method: "cash", amount: 4_000, changeGiven: 0 },
    { method: "card", amount: 6_000, changeGiven: 0 },
  ], 10_000), { ok: true });
  assert.equal(validateTenders([{ method: "cash", amount: 9_998 }], 10_000).ok, false);
  assert.equal(validateTenders([{ method: "cash", amount: 2_100_000_000 }], 2_100_000_000).ok, false);
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
  assert.equal(summary.byAccount[0].grossReceived, 10_000);
  assert.equal(summary.byAccount[0].refunds, 0);
  assert.equal(summary.byAccount[0].changeGiven, 1_000);
  assert.equal(summary.byAccount[0].netApplied, 9_000);
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

test("offline sale can replay only into the shift where it was rung up", () => {
  const now = new Date("2026-01-02T10:00:00Z").getTime();
  const session = {
    status: "closed",
    openedAt: "2026-01-01T08:00:00Z",
    closedAt: "2026-01-01T18:00:00Z",
  };
  assert.equal(canReplayOfflineSale(session, new Date("2026-01-01T12:00:00Z").getTime(), now), true);
  assert.equal(canReplayOfflineSale(session, new Date("2026-01-01T19:00:00Z").getTime(), now), false);
  assert.equal(canReplayOfflineSale({ ...session, status: "open" }, new Date("2026-01-01T12:00:00Z").getTime(), now), false);
});

test("offline replay rejects sales older than seven days", () => {
  const now = new Date("2026-01-10T10:00:00Z").getTime();
  const session = {
    status: "closed",
    openedAt: "2026-01-01T08:00:00Z",
    closedAt: "2026-01-01T18:00:00Z",
  };
  assert.equal(canReplayOfflineSale(session, new Date("2026-01-01T12:00:00Z").getTime(), now), false);
});

test("staff price adjustments remain blocked", () => {
  assert.deepEqual(
    posPriceAdjustmentPolicy({ isOwner: false, wantsPriceChange: true, isOfflineReplay: true, hasPriceDifference: true }),
    { blocked: true, reviewRequired: false },
  );
});

test("staff offline catalogue drift syncs with owner review required", () => {
  assert.deepEqual(
    posPriceAdjustmentPolicy({ isOwner: false, wantsPriceChange: false, isOfflineReplay: true, hasPriceDifference: true }),
    { blocked: false, reviewRequired: true },
  );
});

test("owner price differences do not require an automatic review flag", () => {
  assert.deepEqual(
    posPriceAdjustmentPolicy({ isOwner: true, wantsPriceChange: true, isOfflineReplay: true, hasPriceDifference: true }),
    { blocked: false, reviewRequired: false },
  );
});

// ---------------------------------------------------------------------
// The change float: the small notes kept in the drawer purely to give
// change. It is never declared in the opening float, so the physical
// drawer always holds it ON TOP of what expectedCash predicts - counting
// it as takings would make every shift read over by the size of the
// kitty. See CHANGE_FLOAT_BELOW in lib/pos.js.
// ---------------------------------------------------------------------

test("a note-by-note count splits takings from the change float at ₦500", () => {
  // 2x₦1000 + 3x₦500 = ₦3,500 takings; 4x₦200 + 10x₦50 = ₦1,300 float.
  const { countedKobo, changeFloatKobo } = splitCountBreakdown({ 1000: 2, 500: 3, 200: 4, 50: 10 });
  assert.equal(countedKobo, 350_000);
  assert.equal(changeFloatKobo, 130_000);
});

test("₦500 itself is takings, not float", () => {
  // The rule the shop works to is "not up to 500" - so 500 is counted.
  assert.equal(splitCountBreakdown({ 500: 1 }).countedKobo, 50_000);
  assert.equal(splitCountBreakdown({ 500: 1 }).changeFloatKobo, 0);
  assert.equal(splitCountBreakdown({ 200: 1 }).countedKobo, 0);
  assert.equal(splitCountBreakdown({ 200: 1 }).changeFloatKobo, 20_000);
});

test("the float never leaks into the counted figure", () => {
  // The whole point: over/short is computed from countedKobo alone, so a
  // bigger kitty must not move it by a single kobo.
  const small = splitCountBreakdown({ 1000: 5, 100: 2 });
  const large = splitCountBreakdown({ 1000: 5, 100: 400 });
  assert.equal(small.countedKobo, large.countedKobo);
  assert.notEqual(small.changeFloatKobo, large.changeFloatKobo);
});

test("an empty or junk count is zero on both sides, never NaN", () => {
  for (const input of [undefined, null, {}, { 1000: 0 }, { abc: 3 }, { 500: -2 }]) {
    const out = splitCountBreakdown(input);
    assert.equal(out.countedKobo, 0, `countedKobo for ${JSON.stringify(input)}`);
    assert.equal(out.changeFloatKobo, 0, `changeFloatKobo for ${JSON.stringify(input)}`);
  }
});

// ---------------------------------------------------------------------
// The close count, recorded for what it is.
//
// The close is counted note by note from ₦1,000 down to ₦5, and every note
// is counted cash. The change is typed separately as one total. Nothing is
// compared with an expected figure on any screen.
// ---------------------------------------------------------------------

test("every note from ₦1,000 down to ₦5 is counted cash", () => {
  const close = resolveCloseCount({
    forced: false,
    countBreakdown: { 1000: 2, 500: 3, 200: 4, 100: 1, 50: 2, 20: 1, 10: 1, 5: 1 },
    expectedCash: 0,
  });
  // 2,000 + 1,500 + 800 + 100 + 100 + 20 + 10 + 5 = ₦4,535
  assert.equal(close.countedCash, 453_500);
  assert.equal(close.closeMethod, "blind_count");
});

test("change is its own typed total, never added to the counted cash", () => {
  const close = resolveCloseCount({
    forced: false,
    countBreakdown: { 1000: 5 },
    closingChangeCashKobo: 120_000,
    expectedCash: 0,
  });
  assert.equal(close.countedCash, 500_000);
  assert.equal(close.closingChangeCash, 120_000);
});

test("change left blank is null, never a made-up zero", () => {
  const withNotes = resolveCloseCount({ forced: false, countBreakdown: { 1000: 5 }, expectedCash: 0 });
  assert.equal(withNotes.closingChangeCash, null);
  const withTotal = resolveCloseCount({ forced: false, countedCashKobo: 200_000, expectedCash: 0 });
  assert.equal(withTotal.closingChangeCash, null);
  const zero = resolveCloseCount({ forced: false, countBreakdown: { 1000: 5 }, closingChangeCashKobo: 0, expectedCash: 0 });
  assert.equal(zero.closingChangeCash, 0);
});

test("the notes beat whatever total the device sent", () => {
  // The trust boundary: a device could send any countedCash, so when the
  // notes are there the server adds them up itself.
  const close = resolveCloseCount({
    forced: false,
    countBreakdown: { 1000: 2 },
    countedCashKobo: 9_999_999,
    expectedCash: 0,
  });
  assert.equal(close.countedCash, 200_000);
});

test("an empty drawer can be closed at ₦0", () => {
  const close = resolveCloseCount({ forced: false, countBreakdown: {}, expectedCash: 50_000 });
  assert.equal(close.countedCash, 0);
});

test("a forced close records no count of its own", () => {
  const close = resolveCloseCount({ forced: true, countBreakdown: { 1000: 3 }, closingChangeCashKobo: 5_000, expectedCash: 70_000 });
  assert.equal(close.closeMethod, "forced_uncounted");
  assert.equal(close.closingChangeCash, null);
});

test("a shift with no recorded basis is read as the old all-cash one", () => {
  assert.equal(openingBasisOf(undefined), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({}), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({ openingBasis: null }), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({ openingBasis: "counted_notes" }), OPENING_BASIS.COUNTED_NOTES);
});

// ---------------------------------------------------------------------
// Gross cash in / change given, derived rather than stored.
//
// A sale writes ONE cash_sale movement holding (cash tendered − change),
// so the drawer total is right but the Z can't say how much cash actually
// crossed the counter. The pair is derived from the tender rows instead -
// which works identically on historical rows, because the ledger total is
// basis-invariant: net writes (gross−change) once, a gross basis would
// write gross and −change, and both sum to the same thing.
// ---------------------------------------------------------------------

const shift = ({ tenders, movements }) =>
  buildSessionSummary({
    session: { openingFloat: 20_000, openedAt: "2026-10-10T08:00:00.000Z" },
    orders: [],
    tenders,
    movements,
  });

test("gross cash and change reconcile to the drawer on historical net rows", () => {
  // ₦10,000 handed over for an ₦8,000 sale: one net cash_sale of ₦8,000,
  // which is exactly what every shift before this change stored.
  const summary = shift({
    tenders: [{ method: "cash", amount: 1_000_000, changeGiven: 200_000 }],
    movements: [{ kind: "cash_sale", amount: 800_000 }],
  });

  assert.equal(summary.cashTenderedGross, 1_000_000);
  assert.equal(summary.cashChangeGiven, 200_000);
  assert.equal(summary.cashSplitTies, true);
  // The two new lines must sum to the same drawer movement they replace.
  assert.equal(
    summary.cashTenderedGross - summary.changeGivenTotal,
    summary.drawer.cashSales + summary.drawer.changeOut,
  );
  assert.equal(summary.drawer.expectedCash, 20_000 + 800_000);
});

test("cash change and POS-overpayment change are both counted, once each", () => {
  const summary = shift({
    tenders: [
      { method: "cash", amount: 500_000, changeGiven: 100_000 },
      { method: "card", provider: "Moniepoint", amount: 300_000, changeGiven: 50_000 },
    ],
    movements: [
      { kind: "cash_sale", amount: 400_000 },
      { kind: "change_out", amount: -50_000 },
    ],
  });

  assert.equal(summary.cashChangeGiven, 100_000, "cash-tender change");
  assert.equal(summary.nonCashChangeOut, 50_000, "card-overpayment change");
  assert.equal(summary.changeGivenTotal, 150_000);
  assert.equal(summary.cashSplitTies, true);
});

test("a hand-patched ledger fails the tie check instead of printing a wrong split", () => {
  // Same tenders, but the cash_sale movement has been edited in SQL.
  const summary = shift({
    tenders: [{ method: "cash", amount: 1_000_000, changeGiven: 200_000 }],
    movements: [{ kind: "cash_sale", amount: 750_000 }],
  });
  assert.equal(summary.cashSplitTies, false, "the Z must fall back to the old net line here");
});

test("per-method applied figures share one basis, unlike byTenderMethod", () => {
  const summary = shift({
    tenders: [{ method: "transfer", provider: "Opay", amount: 1_000_000, changeGiven: 400_000 }],
    movements: [{ kind: "change_out", amount: -400_000 }],
  });
  // The account really did receive the full ₦10,000 - that stays gross.
  assert.equal(summary.byTenderMethod.transfer, 1_000_000);
  // ...but only ₦6,000 of it paid for anything, which is what ties to sales.
  assert.equal(summary.byTenderMethodApplied.transfer, 600_000);
});
