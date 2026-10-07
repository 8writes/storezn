import { db } from "./db/index.js";
import { shippingRates } from "./db/schema.js";
import { eq } from "drizzle-orm";

// Resolves what a store charges to ship to a given address: a city/LGA
// match beats a state-only match, which beats the store's flat
// defaultShippingFee - unless the store has defaultShippingIsTBD set (the
// platform default), in which case that fallback is "to be determined"
// instead of a guessed number. Matched case-insensitively (in memory, a
// store's rate list is small - dozens of rows at most), same free-text
// state/city fields already used throughout this app (addresses,
// shippingAddress) - there's no canonical Nigerian-states list enforced
// anywhere, so an exact case-sensitive DB match would be too brittle.
//
// Returns { fee, isTBD } - a matched shippingRates row is always a known,
// fixed fee (isTBD: false); only the store-level fallback can be TBD.
export async function resolveShippingFee(store, address) {
  const fallback = () =>
    store.defaultShippingIsTBD ? { fee: 0, isTBD: true } : { fee: store.defaultShippingFee ?? 0, isTBD: false };

  if (!address?.state) return fallback();

  const rows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, store.id));
  const wantState = address.state.trim().toLowerCase();
  const candidates = rows.filter((r) => r.state.trim().toLowerCase() === wantState);

  if (address.city) {
    const wantCity = address.city.trim().toLowerCase();
    const cityMatch = candidates.find((r) => r.city && r.city.trim().toLowerCase() === wantCity);
    if (cityMatch) return { fee: cityMatch.fee, isTBD: false };
  }

  const stateMatch = candidates.find((r) => !r.city);
  if (stateMatch) return { fee: stateMatch.fee, isTBD: false };

  return fallback();
}

// Does this store deliver to `state` at all? NULL/empty deliveryStates
// means everywhere (see stores.deliveryStates). Compared case-insensitively
// and trimmed for the same reason resolveShippingFee does: state is free
// text on addresses/shippingAddress, with no canonical list enforced at
// the database.
//
// A store with no restriction, or a cart that needs no shipping at all,
// must never be blocked - callers check needsShipping before asking.
export function canDeliverTo(store, state) {
  const allowed = Array.isArray(store?.deliveryStates) ? store.deliveryStates : null;
  if (!allowed || allowed.length === 0) return true;
  const want = String(state || "").trim().toLowerCase();
  if (!want) return false;
  return allowed.some((entry) => String(entry || "").trim().toLowerCase() === want);
}

// The message a shopper sees when their state is not served. One wording,
// used by the cart preview, the checkout page and checkout's own refusal.
export function undeliverableMessage(state) {
  const where = String(state || "").trim();
  return where
    ? `Sorry, this store isn't currently delivering to ${where}.`
    : "Sorry, this store isn't currently delivering to your location.";
}
