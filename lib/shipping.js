import { db } from "./db/index.js";
import { shippingRates } from "./db/schema.js";
import { eq } from "drizzle-orm";

// Resolves what a store charges to ship to a given address: a city/LGA
// match beats a state-only match, which beats the store's flat
// defaultShippingFee. Matched case-insensitively (in memory, a store's
// rate list is small - dozens of rows at most), same free-text
// state/city fields already used throughout this app (addresses,
// shippingAddress) - there's no canonical Nigerian-states list enforced
// anywhere, so an exact case-sensitive DB match would be too brittle.
export async function resolveShippingFee(store, address) {
  if (!address?.state) return store.defaultShippingFee ?? 0;

  const rows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, store.id));
  const wantState = address.state.trim().toLowerCase();
  const candidates = rows.filter((r) => r.state.trim().toLowerCase() === wantState);

  if (address.city) {
    const wantCity = address.city.trim().toLowerCase();
    const cityMatch = candidates.find((r) => r.city && r.city.trim().toLowerCase() === wantCity);
    if (cityMatch) return cityMatch.fee;
  }

  const stateMatch = candidates.find((r) => !r.city);
  if (stateMatch) return stateMatch.fee;

  return store.defaultShippingFee ?? 0;
}
