import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OVER_SHORT_TOLERANCE_KOBO, OPENING_BASIS, buildSessionSummary, canReplayOfflineSale, computeDrawer, openingBasisOf, posOverShortReview, posPriceAdjustmentPolicy, resolveCloseCount, splitCountBreakdown, validateTenders } from "../lib/pos.js";

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
// Over / short: the open side and the close side must measure the SAME
// pile of notes. They once didn't - open took "all the cash in the
// drawer" (change pot included) while the close counted only notes ≥₦500
// - so over/short was minus the whole pot on every shift and the review
// queue flagged everything. See REGISTER-CASH-BASIS-MIGRATION.sql.
// ---------------------------------------------------------------------

// The close as the route computes it, with no database in the way.
const closeOf = ({ openingFloat, movements = [], countBreakdown, countedCashKobo, forced = false }) => {
  const expectedCash = computeDrawer(openingFloat, movements).expectedCash;
  const counted = resolveCloseCount({ forced, countBreakdown, countedCashKobo, expectedCash });
  return { ...counted, expectedCash, overShort: counted.countedCash - expectedCash };
};

test("a shift that takes nothing balances, and the change pot does not move it", () => {
  // Opened on the counted-notes basis: 5×₦1,000 of countable cash, and a
  // pot of small notes nobody counts. Nothing is sold. The drawer at
  // close holds exactly what it held at open.
  const opening = splitCountBreakdown({ 1000: 5 });
  const close = closeOf({ openingFloat: opening.countedKobo, countBreakdown: { 1000: 5, 200: 4, 50: 10 } });
  assert.equal(close.overShort, 0);
  // The pot is recorded, and sits outside both figures.
  assert.equal(close.closingChangeCash, 130_000);
  assert.equal(close.expectedCash, 500_000);
  assert.equal(close.countedCash, 500_000);
});

test("the old all-cash opening basis is what made every shift read short", () => {
  // Same untouched drawer as above, but opened the old way: the cashier
  // was asked for "cash physically in drawer now", so the ₦1,300 pot went
  // into openingFloat while the close still excluded it.
  const close = closeOf({
    openingFloat: 500_000 + 130_000,
    countBreakdown: { 1000: 5, 200: 4, 50: 10 },
  });
  assert.equal(close.overShort, -130_000); // short by exactly the pot
});

test("breaking a note into change reads short, refilling the pile reads over", () => {
  // Neither is a loss - the sign convention is deliberate, and this test
  // exists so nobody "corrects" it later.
  const opening = splitCountBreakdown({ 1000: 10 });
  // Mid-shift the cashier breaks one ₦1,000 note into ₦100s for the pot.
  const broke = closeOf({ openingFloat: opening.countedKobo, countBreakdown: { 1000: 9, 100: 10 } });
  assert.equal(broke.overShort, -100_000);
  // The reverse: a customer pays with small notes, so the pot swells and
  // the cashier swaps ₦1,000 of it back into the counted pile.
  const refilled = closeOf({ openingFloat: opening.countedKobo, countBreakdown: { 1000: 11 } });
  assert.equal(refilled.overShort, 100_000);
});

test("a cash sale lands in the counted pile, not the pot", () => {
  const close = closeOf({
    openingFloat: 500_000,
    movements: [{ kind: "float", amount: 500_000 }, { kind: "cash_sale", amount: 150_000 }],
    countBreakdown: { 1000: 6, 500: 1 },
  });
  assert.equal(close.expectedCash, 650_000);
  assert.equal(close.overShort, 0);
});

test("a note-by-note count beats whatever total the device sent", () => {
  // The trust boundary: a device could send any countedCash, so when a
  // breakdown is present the server derives the figure itself.
  const close = resolveCloseCount({
    forced: false,
    countBreakdown: { 1000: 2 },
    countedCashKobo: 9_999_999,
    closingChangeCashKobo: 9_999_999,
    expectedCash: 200_000,
  });
  assert.equal(close.countedCash, 200_000);
  assert.equal(close.closingChangeCash, 0);
});

test("an uncounted pot is null, never a fabricated zero", () => {
  const withoutPot = resolveCloseCount({ forced: false, countedCashKobo: 200_000, expectedCash: 200_000 });
  assert.equal(withoutPot.closingChangeCash, null);
  const withPot = resolveCloseCount({ forced: false, countedCashKobo: 200_000, closingChangeCashKobo: 4_000, expectedCash: 200_000 });
  assert.equal(withPot.closingChangeCash, 4_000);
});

test("a forced close is square by construction but still goes to review", () => {
  const close = closeOf({ openingFloat: 500_000, movements: [{ kind: "cash_sale", amount: 70_000 }], forced: true });
  assert.equal(close.closeMethod, "forced_uncounted");
  assert.equal(close.overShort, 0);
  assert.equal(close.closingChangeCash, null);
  // Zero variance must NOT clear it - nobody counted the drawer.
  assert.equal(posOverShortReview({ overShort: 0, forced: true, provisional: false, toleranceKobo: 500_000 }).reviewStatus, "pending");
});

test("review is triggered at the tolerance, not a kobo earlier", () => {
  const review = (overShort) => posOverShortReview({ overShort, forced: false, provisional: false, toleranceKobo: 500_000 });
  assert.equal(review(499_999).reviewStatus, "ok");
  assert.equal(review(500_000).reviewStatus, "pending");
  assert.equal(review(-500_000).reviewStatus, "pending"); // short counts the same as over
  assert.equal(review(-499_999).reviewStatus, "ok");
  assert.equal(review(499_999).overTolerance, false);
  assert.equal(review(500_000).overTolerance, true);
});

test("unsynced sales send a close to review whatever the cash says", () => {
  assert.equal(posOverShortReview({ overShort: 0, forced: false, provisional: true, toleranceKobo: 500_000 }).reviewStatus, "pending");
});

test("a missing or zero tolerance falls back to the default, it does not flag everything", () => {
  // A 0 column read literally would make |overShort| >= 0 true for every
  // close - exactly the noisy queue this replaced.
  for (const toleranceKobo of [0, null, undefined, NaN, -1, "abc"]) {
    const review = posOverShortReview({ overShort: 1_000, forced: false, provisional: false, toleranceKobo });
    assert.equal(review.toleranceKobo, DEFAULT_OVER_SHORT_TOLERANCE_KOBO, `tolerance ${toleranceKobo}`);
    assert.equal(review.reviewStatus, "ok", `status for tolerance ${toleranceKobo}`);
  }
});

test("a shift with no recorded basis is read as the old all-cash one", () => {
  assert.equal(openingBasisOf(undefined), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({}), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({ openingBasis: null }), OPENING_BASIS.ALL_CASH);
  assert.equal(openingBasisOf({ openingBasis: "counted_notes" }), OPENING_BASIS.COUNTED_NOTES);
});

test("carried-forward shifts telescope, so the pot's churn cannot accumulate", () => {
  // The invariant the whole design leans on: when each shift opens with
  // what the last one counted, the per-shift noise is zero-sum. Three
  // shifts, each churning small notes differently - the individual
  // over/shorts are non-zero, but their sum is bounded by the pot alone,
  // never by sales volume.
  // No sales, so the drawer holds the same ₦10,000 throughout and every
  // breakdown below totals exactly that - only its split between counted
  // notes and pot changes. That conservation is the precondition; without
  // it the identity is meaningless.
  const shifts = [
    { 1000: 9, 100: 10 },                    // broke a ₦1,000 for change
    { 1000: 10 },                            // swapped the change back out
    { 1000: 9, 500: 1, 200: 2, 100: 1 },     // ended holding small notes
  ];
  let openingFloat = splitCountBreakdown({ 1000: 10 }).countedKobo;
  const potStart = 0;
  let sum = 0;
  let lastPot = potStart;
  for (const countBreakdown of shifts) {
    const close = closeOf({ openingFloat, countBreakdown });
    assert.equal(close.countedCash + close.closingChangeCash, 1_000_000, "fixture must conserve cash");
    sum += close.overShort;
    openingFloat = close.countedCash; // carry forward
    lastPot = close.closingChangeCash;
  }
  assert.notEqual(sum, 0); // the per-shift noise is real
  assert.equal(sum, potStart - lastPot); // but it telescopes to pot movement
  assert.equal(sum, -50_000); // bounded by the pot, never by sales volume
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
