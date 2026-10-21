// Converting naira prices to dollars FOR DISPLAY ONLY.
//
// Products are priced in naira and Paystack charges naira - nothing here
// ever decides what a customer pays. A store can let its customers view
// prices in USD, and a vendor sees the dollar equivalent while typing a
// price; both read a rate fetched by lib/fxRates.js. Client-safe: no
// database or server imports, so storefront and dashboard components can
// use it directly.

// Where a rate can come from. Adding a provider = an entry here plus a
// fetcher in lib/fxRates.js; stores.usdRateProvider holds one of these keys.
//
// Order matters: when a store's chosen source has no current rate, the
// others are tried in this order. The market rate is free and needs no
// key, so it's the default for every store and the first fallback.
export const FX_PROVIDERS = {
  market: { label: "Market rate (ExchangeRate-API)" },
  wise: { label: "Wise" },
};

export const DEFAULT_FX_PROVIDER = "market";

export const FX_PROVIDER_KEYS = Object.keys(FX_PROVIDERS);

export function isFxProvider(key) {
  return Object.prototype.hasOwnProperty.call(FX_PROVIDERS, key);
}

// rate = naira per one dollar. Returns null rather than a nonsense figure
// when either side is unusable, so callers can simply not show a dollar
// price instead of showing "$NaN" or "$Infinity".
export function ngnToUsd(ngn, rate) {
  const amount = Number(ngn);
  const r = Number(rate);
  if (!Number.isFinite(amount) || !Number.isFinite(r) || r <= 0) return null;
  return amount / r;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(usd) {
  if (usd == null || !Number.isFinite(Number(usd))) return "";
  return usdFormatter.format(Number(usd));
}

export function formatUsdFromNgn(ngn, rate) {
  const usd = ngnToUsd(ngn, rate);
  return usd == null ? "" : formatUsd(usd);
}

// "2h ago" for the small "Rate: Wise · updated 2h ago" notes.
export function rateAge(fetchedAt, now = Date.now()) {
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const minutes = Math.max(0, Math.round((now - t) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
