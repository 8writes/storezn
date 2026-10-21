import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { exchangeRates } from "./db/schema.js";
import { DEFAULT_FX_PROVIDER, FX_PROVIDER_KEYS, FX_PROVIDERS, isFxProvider } from "./fxDisplay.js";

// Fetching and serving USD->NGN exchange rates for DISPLAY ONLY - see
// lib/fxDisplay.js. Nothing is ever charged at these figures; the rate is
// shown to customers who switch a storefront to dollars, and to vendors as
// a hint beside the naira price they type.
//
// Rates are fetched by /api/cron/fx-rates (hourly) into exchange_rates, one
// row per provider, and read from there with a short in-memory cache - a
// storefront page never waits on a third-party API.

const CURRENCY = "USD";
const FETCH_TIMEOUT_MS = 10_000;

// A rate older than this is not shown; the next provider is tried instead.
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

// Naira per dollar has to land somewhere believable. These bounds are
// deliberately wide - they only exist to catch a response in the wrong
// shape or direction (USD-per-NGN = 0.00065, a sandbox's 1.0), never to
// second-guess the market.
export const NGN_PER_USD_MIN = 100;
export const NGN_PER_USD_MAX = 100_000;
// A move bigger than this between two hourly fetches is treated as a bad
// response, not a real market move, and the previous rate is kept.
export const MAX_JUMP_RATIO = 0.5;

// Pulls the naira-per-dollar figure out of each provider's response.
export function extractRate(provider, json) {
  if (provider === "wise") {
    // GET /v1/rates?source=USD&target=NGN -> [{ rate, source, target, time }]
    const row = Array.isArray(json) ? json[0] : null;
    return row && row.source === "USD" && row.target === "NGN" ? Number(row.rate) : NaN;
  }
  if (provider === "market") {
    // GET https://open.er-api.com/v6/latest/USD -> { result, base_code, rates: { NGN } }
    if (json?.result !== "success" || json?.base_code !== "USD") return NaN;
    return Number(json?.rates?.NGN);
  }
  return NaN;
}

export function isPlausibleRate(rate, previous = null) {
  if (!Number.isFinite(rate) || rate < NGN_PER_USD_MIN || rate > NGN_PER_USD_MAX) return false;
  const prev = Number(previous);
  if (Number.isFinite(prev) && prev > 0 && Math.abs(rate - prev) / prev > MAX_JUMP_RATIO) return false;
  return true;
}

// The rate a storefront should show: the store's chosen provider if its
// rate is fresh, otherwise the next fresh provider in registry order,
// otherwise null (the storefront then hides the dollar switch rather than
// showing an old figure).
export function chooseRate(rows, preferred, now = Date.now()) {
  const fresh = (row) =>
    row && Number(row.ngnPerUnit) > 0 && now - new Date(row.fetchedAt).getTime() <= STALE_AFTER_MS;
  const byProvider = new Map((rows || []).map((row) => [row.provider, row]));
  // A source that's no longer offered (e.g. the old "manual" Storezn rate)
  // is treated as the default - its leftover row is never served.
  const wanted = isFxProvider(preferred) ? preferred : DEFAULT_FX_PROVIDER;
  const order = [wanted, ...FX_PROVIDER_KEYS.filter((key) => key !== wanted)];
  for (const provider of order) {
    const row = byProvider.get(provider);
    if (fresh(row)) {
      return {
        provider,
        label: FX_PROVIDERS[provider]?.label || provider,
        rate: Number(row.ngnPerUnit),
        fetchedAt: new Date(row.fetchedAt).toISOString(),
        isFallback: provider !== wanted,
      };
    }
  }
  return null;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

const FETCHERS = {
  wise: async () => {
    const token = process.env.WISE_API_TOKEN;
    if (!token) throw new Error("WISE_API_TOKEN is not set");
    return getJson("https://api.wise.com/v1/rates?source=USD&target=NGN", { Authorization: `Bearer ${token}` });
  },
  market: async () => getJson("https://open.er-api.com/v6/latest/USD"),
};

// Called by the cron. One provider failing never stops the others, and a
// failed or implausible fetch leaves that provider's last good rate in
// place rather than blanking it.
export async function refreshExchangeRates() {
  const existing = await db.select().from(exchangeRates);
  const previousByProvider = new Map(existing.map((row) => [row.provider, row.ngnPerUnit]));

  const results = [];
  for (const provider of Object.keys(FETCHERS)) {
    try {
      const json = await FETCHERS[provider]();
      const rate = extractRate(provider, json);
      if (!isPlausibleRate(rate, previousByProvider.get(provider))) {
        results.push({ provider, ok: false, error: `implausible rate ${rate}` });
        continue;
      }
      await db
        .insert(exchangeRates)
        .values({ provider, currency: CURRENCY, ngnPerUnit: rate, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: [exchangeRates.provider, exchangeRates.currency],
          set: { ngnPerUnit: rate, fetchedAt: sql`now()` },
        });
      results.push({ provider, ok: true, rate });
    } catch (err) {
      results.push({ provider, ok: false, error: err?.message || String(err) });
    }
  }
  cached = { rows: null, expiresAt: 0 };
  return results;
}

// Short cache: storefront layouts read this on every page, and the rate
// only changes hourly. Same pattern as lib/maintenanceMode.js.
const CACHE_MS = 5 * 60 * 1000;
let cached = { rows: null, expiresAt: 0 };

async function readRows() {
  if (cached.rows && Date.now() < cached.expiresAt) return cached.rows;
  try {
    const rows = await db.select().from(exchangeRates);
    cached = { rows, expiresAt: Date.now() + CACHE_MS };
    return rows;
  } catch {
    // A DB hiccup must not take a storefront down for a display nicety -
    // serve the last rows we had (or none) and retry next time.
    return cached.rows || [];
  }
}

export async function getUsdRate(preferred = DEFAULT_FX_PROVIDER) {
  return chooseRate(await readRows(), preferred);
}

// Every provider's current figure, for the vendor settings picker.
export async function listUsdRates(now = Date.now()) {
  const rows = await readRows();
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  // Wise can only ever have a rate with an API token configured - without
  // one it's not offered as a choice at all (a store that already picked it
  // just falls back to the next source; see chooseRate).
  const offered = FX_PROVIDER_KEYS.filter((provider) => provider !== "wise" || !!process.env.WISE_API_TOKEN);
  return offered.map((provider) => {
    const row = byProvider.get(provider);
    const fetchedAt = row ? new Date(row.fetchedAt).toISOString() : null;
    return {
      provider,
      label: FX_PROVIDERS[provider].label,
      rate: row ? Number(row.ngnPerUnit) : null,
      fetchedAt,
      stale: !row || now - new Date(row.fetchedAt).getTime() > STALE_AFTER_MS,
    };
  });
}
