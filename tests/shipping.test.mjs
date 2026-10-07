import test from "node:test";
import assert from "node:assert/strict";
import { canDeliverTo, undeliverableMessage } from "../lib/shipping.js";

// stores.deliveryStates: NULL/absent = delivers everywhere, which is both
// the pre-existing behaviour and what every store had before the column
// existed. Only an explicit, non-empty list restricts anything.

test("a store with no delivery list serves every state", () => {
  assert.equal(canDeliverTo({}, "Lagos"), true);
  assert.equal(canDeliverTo({ deliveryStates: null }, "Kano"), true);
});

test("an empty list is treated as everywhere, never as nowhere", () => {
  // The vendor route normalises [] to null on save; this is the second
  // line of defence for a row that got there another way. "Nowhere" would
  // silently close a store to every physical order.
  assert.equal(canDeliverTo({ deliveryStates: [] }, "Lagos"), true);
});

test("a listed state is served and an unlisted one is not", () => {
  const store = { deliveryStates: ["Lagos", "Ogun"] };
  assert.equal(canDeliverTo(store, "Lagos"), true);
  assert.equal(canDeliverTo(store, "Ogun"), true);
  assert.equal(canDeliverTo(store, "Kano"), false);
});

test("matching ignores case and surrounding space", () => {
  // Address state is free text with no canonical list enforced at the
  // database - same reasoning as resolveShippingFee's own matching.
  const store = { deliveryStates: ["  Lagos "] };
  assert.equal(canDeliverTo(store, "lagos"), true);
  assert.equal(canDeliverTo(store, "LAGOS"), true);
  assert.equal(canDeliverTo(store, " Lagos"), true);
});

test("a restricted store rejects a missing state rather than defaulting open", () => {
  const store = { deliveryStates: ["Lagos"] };
  assert.equal(canDeliverTo(store, ""), false);
  assert.equal(canDeliverTo(store, null), false);
  assert.equal(canDeliverTo(store, undefined), false);
});

test("the shopper-facing message names the state when there is one", () => {
  assert.match(undeliverableMessage("Kano"), /Kano/);
  assert.match(undeliverableMessage(""), /your location/);
  assert.match(undeliverableMessage(null), /your location/);
});
