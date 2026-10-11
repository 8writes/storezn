import test from "node:test";
import assert from "node:assert/strict";
import { signedSafeAmount, summariseSafePeriod, SAFE_KIND_LABEL } from "../lib/safe.js";

// The safe is a signed-kobo ledger, + into the safe. Its balance is
// always SUM(amount), so the only thing that has to be right is the sign
// each kind carries. See lib/safe.js.

test("each kind moves the money the way its name says", () => {
  assert.equal(signedSafeAmount("opening", 50_000), 50_000, "stating what is there adds it");
  assert.equal(signedSafeAmount("drop_in", 50_000), 50_000, "a till dropping cash fills the safe");
  assert.equal(signedSafeAmount("topup_out", 50_000), -50_000, "topping up a till empties it");
  assert.equal(signedSafeAmount("expense_out", 50_000), -50_000, "paying the ajo empties it");
});

test("a magnitude is taken as a magnitude, whatever sign it arrives with", () => {
  // Routes pass toKobo(amount) from a positive-only schema, but the sign
  // must come from the kind, never from how the caller happened to phrase
  // it - otherwise a negative input would turn a payout into a deposit.
  assert.equal(signedSafeAmount("expense_out", -50_000), -50_000);
  assert.equal(signedSafeAmount("drop_in", -50_000), 50_000);
});

test("an adjustment keeps the direction the caller chose", () => {
  // It is the one kind that can go either way: a recount can find more
  // or less than the ledger says.
  assert.equal(signedSafeAmount("adjustment", 20_000), 20_000);
  assert.equal(signedSafeAmount("adjustment", -20_000), -20_000);
});

test("summaries split what came in from what went out", () => {
  const totals = summariseSafePeriod([
    { kind: "opening", amount: 100_000 },
    { kind: "drop_in", amount: 400_000 },
    { kind: "drop_in", amount: 250_000 },
    { kind: "topup_out", amount: -150_000 },
    { kind: "expense_out", amount: -60_000 },
    { kind: "adjustment", amount: -5_000 },
  ]);

  assert.equal(totals.opening, 100_000);
  assert.equal(totals.droppedIn, 650_000);
  // Reported as positive magnitudes - these read as "how much went out",
  // not as negative numbers to be added up by eye.
  assert.equal(totals.toppedUp, 150_000);
  assert.equal(totals.paidOut, 60_000);
  assert.equal(totals.adjustments, -5_000);
  // net is what the balance actually is: every row, signed, summed.
  assert.equal(totals.net, 535_000);
});

test("an empty period summarises to zeros rather than NaN", () => {
  for (const input of [undefined, null, []]) {
    const totals = summariseSafePeriod(input);
    assert.equal(totals.net, 0);
    assert.equal(totals.droppedIn, 0);
    assert.equal(totals.paidOut, 0);
  }
});

test("every kind has a label for the ledger list", () => {
  for (const kind of ["opening", "drop_in", "topup_out", "expense_out", "adjustment"]) {
    assert.equal(typeof SAFE_KIND_LABEL[kind], "string");
    assert.ok(SAFE_KIND_LABEL[kind].length > 0, `${kind} needs a label`);
  }
});
