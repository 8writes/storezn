import test from "node:test";
import assert from "node:assert/strict";
import { namesLookConsistent } from "../lib/verifyGuru.js";

// This function is the ONLY thing binding a NIN to the person claiming
// it. Verified against the live VerifyGuru endpoint: a real NIN sent with
// the invented name "DARĆ AGAIN" returned `status: success` and the real
// holder's record, so the provider does not check names at all - it is a
// lookup. If this comparison passes, a vendor goes live and can attach a
// payout account. See lib/verifyGuru.js.

const record = (first, middle, last) => [first, middle, last];

test("an exact first/last match is approved", () => {
  assert.equal(namesLookConsistent(["Chidi", "Okafor"], record("Chidi", "", "Okafor")), true);
});

test("the surname listed first is still the same person", () => {
  // The actual bug: NIN records routinely put the surname first, and the
  // old positional comparison rejected every one of them - all 6 real
  // submissions went to manual review because of this.
  assert.equal(namesLookConsistent(["Chidi", "Okafor"], record("Okafor", "", "Chidi")), true);
});

test("a middle name on the record doesn't block a match", () => {
  assert.equal(namesLookConsistent(["Miracle", "Wonu"], record("Miracle", "Nduka", "Wonu")), true);
});

test("a name that only exists in the record's middlename still matches", () => {
  // Plenty of people use their middle name day to day.
  assert.equal(namesLookConsistent(["Nduka", "Wonu"], record("Miracle", "Nduka", "Wonu")), true);
});

test("accents and punctuation don't break a match", () => {
  assert.equal(namesLookConsistent(["Adé", "Ade-Bayo"], record("Ade", "", "Adebayo")), true, "a hyphenated name matches the joined spelling on the record");
  assert.equal(namesLookConsistent(["Adé"], record("Ade", "", "Bayo")), true, "an accented name matches its plain form");
  assert.equal(namesLookConsistent(["O'Neil"], record("Oneil", "", "James")), true);
});

test("a single letter is treated as an initial", () => {
  assert.equal(namesLookConsistent(["M", "Wonu"], record("Miracle", "Nduka", "Wonu")), true);
});

test("a different person's NIN is refused", () => {
  // The case that matters. This is exactly what the live test sent.
  assert.equal(namesLookConsistent(["DARĆ", "AGAIN"], record("Miracle", "Nduka", "Wonu")), false);
  assert.equal(namesLookConsistent(["Chidi", "Okafor"], record("Miracle", "Nduka", "Wonu")), false);
});

test("a partial match is not enough", () => {
  // Sharing one common surname with the NIN holder must not be a pass.
  assert.equal(namesLookConsistent(["Blessing", "Wonu"], record("Miracle", "Nduka", "Wonu")), false);
});

test("missing names on either side fail closed", () => {
  assert.equal(namesLookConsistent([], record("Miracle", "", "Wonu")), false);
  assert.equal(namesLookConsistent(["Miracle", "Wonu"], record("", "", "")), false);
  assert.equal(namesLookConsistent([null, undefined], record(null, null, null)), false);
  // Punctuation alone has no tokens - must not sneak through as "empty
  // claim matches everything".
  assert.equal(namesLookConsistent(["---", "''"], record("Miracle", "", "Wonu")), false);
});
