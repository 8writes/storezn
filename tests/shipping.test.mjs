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

// ---------------------------------------------------------------------
// Delivery abroad: country > state > city, most specific wins.
// ---------------------------------------------------------------------
import { defaultShippingFor, pickShippingRate } from "../lib/shipping.js";
import { normaliseCountry, isNigeria } from "../lib/countries.js";

const rateRows = [
  { country: "Nigeria", state: "Lagos", city: null, fee: 4000 },
  { country: "Nigeria", state: "Lagos", city: "Ikeja", fee: 2500 },
  { country: "United Kingdom", state: null, city: null, fee: 45000 },
  { country: "United Kingdom", state: "Scotland", city: null, fee: 52000 },
  { country: "United States", state: "Texas", city: "Houston", fee: 70000 },
];

test("the most specific rate wins: city, then state, then country", () => {
  assert.equal(pickShippingRate(rateRows, { country: "Nigeria", state: "Lagos", city: "Ikeja" }).fee, 2500);
  assert.equal(pickShippingRate(rateRows, { country: "Nigeria", state: "Lagos", city: "Lekki" }).fee, 4000);
  assert.equal(pickShippingRate(rateRows, { country: "United Kingdom", state: "Scotland", city: "Glasgow" }).fee, 52000);
  assert.equal(pickShippingRate(rateRows, { country: "United Kingdom", state: "England", city: "London" }).fee, 45000);
  assert.equal(pickShippingRate(rateRows, { country: "United Kingdom" }).fee, 45000);
});

test("an address with no country is Nigeria, exactly as before", () => {
  assert.equal(pickShippingRate(rateRows, { state: "Lagos", city: "Ikeja" }).fee, 2500);
  assert.equal(normaliseCountry(""), "Nigeria");
  assert.equal(isNigeria(undefined), true);
});

test("a state's rate never leaks into another country", () => {
  // "Texas" only has a Houston rate - no country or state rate for the US.
  assert.equal(pickShippingRate(rateRows, { country: "United States", state: "Texas", city: "Dallas" }), null);
  assert.equal(pickShippingRate(rateRows, { country: "Ghana", state: "Lagos" }), null);
});

test("matching ignores case and stray spaces", () => {
  assert.equal(pickShippingRate(rateRows, { country: " united kingdom ", state: "SCOTLAND" }).fee, 52000);
});

test("no rate falls back to the local default in Nigeria and the abroad default elsewhere", () => {
  const store = { defaultShippingIsTBD: false, defaultShippingFee: 3000, intlDefaultShippingIsTBD: false, intlDefaultShippingFee: 60000 };
  assert.deepEqual(defaultShippingFor(store, { country: "Nigeria", state: "Kano" }), { fee: 3000, isTBD: false });
  assert.deepEqual(defaultShippingFor(store, { country: "Canada" }), { fee: 60000, isTBD: false });
  assert.deepEqual(defaultShippingFor({ ...store, intlDefaultShippingIsTBD: true }, { country: "Canada" }), { fee: 0, isTBD: true });
});

test("abroad is refused unless the store has international delivery on", () => {
  assert.equal(canDeliverTo({ internationalDeliveryEnabled: false }, { country: "Ghana" }), false);
  assert.equal(canDeliverTo({ internationalDeliveryEnabled: true, deliveryCountries: null }, { country: "Ghana" }), true);
});

test("a country list limits delivery to exactly those countries", () => {
  const store = { internationalDeliveryEnabled: true, deliveryCountries: ["United Kingdom", "Ghana"] };
  assert.equal(canDeliverTo(store, { country: "ghana" }), true);
  assert.equal(canDeliverTo(store, { country: "United States" }), false);
});

test("Nigeria still follows its own state list, unaffected by the abroad settings", () => {
  const store = { deliveryStates: ["Lagos"], internationalDeliveryEnabled: false };
  assert.equal(canDeliverTo(store, { country: "Nigeria", state: "Lagos" }), true);
  assert.equal(canDeliverTo(store, { country: "Nigeria", state: "Kano" }), false);
  assert.equal(canDeliverTo(store, "Lagos"), true); // older callers passing a bare state
});

test("the refusal names the country abroad and the state at home", () => {
  assert.equal(undeliverableMessage({ country: "Canada", state: "Ontario" }), "Sorry, this store isn't currently delivering to Canada.");
  assert.equal(undeliverableMessage({ country: "Nigeria", state: "Kano" }), "Sorry, this store isn't currently delivering to Kano.");
});

test("address place line: Nigerian addresses unchanged, abroad adds postcode and country", async () => {
  const { formatAddressPlace } = await import("../lib/countries.js");
  assert.equal(formatAddressPlace({ city: "Ikeja", state: "Lagos", country: "Nigeria" }), "Ikeja, Lagos");
  assert.equal(formatAddressPlace({ city: "Ikeja", state: "Lagos" }), "Ikeja, Lagos");
  assert.equal(formatAddressPlace({ city: "Ikeja", state: "Lagos", postalCode: "100001" }), "Ikeja, Lagos");
  assert.equal(
    formatAddressPlace({ city: "Manchester", state: "", postalCode: "M1 1AA", country: "united kingdom" }),
    "Manchester, M1 1AA, United Kingdom",
  );
  assert.equal(formatAddressPlace(null), "");
});
