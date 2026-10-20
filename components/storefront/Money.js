"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import { formatCurrency } from "@/lib/format.js";
import { formatUsdFromNgn } from "@/lib/fxDisplay.js";
import {
  getServerDisplayCurrency,
  readDisplayCurrency,
  saveDisplayCurrency,
  subscribeToDisplayCurrency,
} from "@/lib/displayCurrency.js";

// Storefront prices in naira or - when the store offers it and the
// customer has switched - in dollars. DISPLAY ONLY: every amount passed in
// is naira, and checkout always charges that naira (see lib/fxDisplay.js).
//
// The layout resolves the store's rate on the server once per page and
// hands it down here, so no price on the page ever waits on a request.

const UsdRateContext = createContext(null);

// rate: { rate, label, fetchedAt, isFallback } or null when the store
// doesn't accept international payments, or no current rate exists (then
// everything is naira and no switch is shown).
// defaultCurrency: what the storefront shows before the customer picks -
// "USD" for a store that accepts international payments, else "NGN".
// international: the store accepts international payments, so checkout and
// the quote form ask whether the customer is paying with a foreign card.
// (Separate from `rate` - a store can accept them while no rate exists.)
// delivery: { international, countries } - whether the store delivers
// outside Nigeria and where (countries null = anywhere), for address forms
// that don't load the cart. Not money, but it's the one store-wide context
// the storefront already has.
export function CurrencyProvider({ rate, defaultCurrency = "NGN", international = false, delivery = null, children }) {
  return (
    <UsdRateContext.Provider value={{ rate: rate || null, defaultCurrency, international, delivery }}>{children}</UsdRateContext.Provider>
  );
}

export function useStoreDelivery() {
  const delivery = useContext(UsdRateContext)?.delivery;
  return { international: !!delivery?.international, countries: delivery?.countries ?? null };
}

export function useUsdRate() {
  return useContext(UsdRateContext)?.rate || null;
}

export function useMoney() {
  const context = useContext(UsdRateContext);
  const usdRate = context?.rate || null;
  const stored = useSyncExternalStore(subscribeToDisplayCurrency, readDisplayCurrency, getServerDisplayCurrency);
  const chosen = stored ?? context?.defaultCurrency ?? "NGN";
  // Dollars only when the customer chose them AND there's a rate to use -
  // a store that later turns the feature off, or loses its rate, quietly
  // goes back to naira for everyone.
  const isUsd = chosen === "USD" && !!usdRate;
  const format = (ngn) => {
    if (!isUsd) return formatCurrency(ngn);
    return formatUsdFromNgn(ngn, usdRate.rate) || formatCurrency(ngn);
  };
  return {
    currency: isUsd ? "USD" : "NGN",
    isUsd,
    available: !!usdRate,
    rate: usdRate,
    internationalStore: !!context?.international,
    format,
    // Always naira, whatever the customer is viewing - for "you'll be
    // charged ₦..." lines.
    formatNaira: formatCurrency,
    setCurrency: saveDisplayCurrency,
  };
}

// For server components (e.g. the product page) that can't call the hook.
export function Money({ amount }) {
  const { format } = useMoney();
  return <>{format(amount)}</>;
}
