import { db } from "./db/index.js";
import { shippingRates } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { NIGERIA, normaliseCountry } from "./countries.js";

// Delivery: what a store charges to ship to an address, and whether it
// ships there at all.
//
// Rates work like Shopify's shipping zones, kept to three levels. A rate
// can be set for a whole COUNTRY, a STATE/region in it, or a CITY/LGA in
// that state - and the most specific match wins:
//
//   city/LGA  >  state/region  >  country  >  the store's default
//
// The default is the local one (defaultShippingFee / defaultShippingIsTBD)
// for Nigeria, and the abroad one (intlDefaultShipping*) for any other
// country. Everything is matched case-insensitively and trimmed - state and
// city are free text on addresses, with no canonical list at the database.
// An address with no country is Nigeria (every address before this existed).
//
// Returns { fee, isTBD } - a matched rate is always a known fixed fee; only
// the store-level default can be "to be determined".

const norm = (value) => String(value ?? "").trim().toLowerCase();

// Pure: the most specific rate row for an address, or null. Exported for
// tests; resolveShippingFee is the one callers use.
export function pickShippingRate(rows, address) {
  const country = norm(normaliseCountry(address?.country));
  const state = norm(address?.state);
  const city = norm(address?.city);
  const inCountry = (rows || []).filter((row) => norm(normaliseCountry(row.country)) === country);

  if (state && city) {
    const cityMatch = inCountry.find((row) => norm(row.state) === state && row.city && norm(row.city) === city);
    if (cityMatch) return cityMatch;
  }
  if (state) {
    const stateMatch = inCountry.find((row) => norm(row.state) === state && !row.city);
    if (stateMatch) return stateMatch;
  }
  return inCountry.find((row) => !row.state && !row.city) || null;
}

export function defaultShippingFor(store, address) {
  if (normaliseCountry(address?.country) === NIGERIA) {
    return store.defaultShippingIsTBD ? { fee: 0, isTBD: true } : { fee: store.defaultShippingFee ?? 0, isTBD: false };
  }
  return store.intlDefaultShippingIsTBD ? { fee: 0, isTBD: true } : { fee: store.intlDefaultShippingFee ?? 0, isTBD: false };
}

export async function resolveShippingFee(store, address) {
  const rows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, store.id));
  const match = pickShippingRate(rows, address);
  if (match) return { fee: match.fee, isTBD: false };
  return defaultShippingFor(store, address);
}

// Does this store deliver to this address at all? Accepts an address
// object, or (for older callers) a bare Nigerian state string.
//
//  - Nigeria: NULL/empty deliveryStates means every state; a list means
//    exactly those states (stores.deliveryStates).
//  - Abroad: only when the store has international delivery switched on,
//    and then NULL/empty deliveryCountries means anywhere, a list means
//    exactly those countries.
//
// A cart that needs no shipping must never be blocked - callers check
// needsShipping before asking.
export function canDeliverTo(store, addressOrState) {
  const address = typeof addressOrState === "object" && addressOrState !== null
    ? addressOrState
    : { country: NIGERIA, state: addressOrState };
  const country = normaliseCountry(address.country);

  if (country === NIGERIA) {
    const allowed = Array.isArray(store?.deliveryStates) ? store.deliveryStates : null;
    if (!allowed || allowed.length === 0) return true;
    const want = norm(address.state);
    if (!want) return false;
    return allowed.some((entry) => norm(entry) === want);
  }

  if (!store?.internationalDeliveryEnabled) return false;
  const countries = Array.isArray(store.deliveryCountries) ? store.deliveryCountries : null;
  if (!countries || countries.length === 0) return true;
  const want = norm(country);
  return countries.some((entry) => norm(normaliseCountry(entry)) === want);
}

// The message a shopper sees when their address isn't served. One wording,
// used by the cart preview, the checkout page and checkout's own refusal.
export function undeliverableMessage(addressOrState) {
  const address = typeof addressOrState === "object" && addressOrState !== null
    ? addressOrState
    : { country: NIGERIA, state: addressOrState };
  const country = normaliseCountry(address.country);
  const where = country === NIGERIA ? String(address.state || "").trim() : country;
  return where
    ? `Sorry, this store isn't currently delivering to ${where}.`
    : "Sorry, this store isn't currently delivering to your location.";
}
