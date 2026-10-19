// Which currency a storefront customer has chosen to VIEW prices in.
//
// Display only - checkout always charges the naira the vendor set. Kept in
// localStorage, which is already per storefront (each store is its own
// subdomain or custom domain, so its own origin), and read through
// useSyncExternalStore - the same shape as lib/theme.js, including the
// "storage" listener that keeps other open tabs in step.

export const DISPLAY_CURRENCY_KEY = "storezn_display_currency";
export const DISPLAY_CURRENCY_EVENT = "storezn:display-currency";
const ALLOWED = new Set(["NGN", "USD"]);

// null means "the customer hasn't chosen" - distinct from choosing naira,
// because a store that accepts international payments opens in dollars
// until the customer says otherwise (see useMoney's defaultCurrency).
export function readDisplayCurrency() {
  try {
    const value = localStorage.getItem(DISPLAY_CURRENCY_KEY);
    return ALLOWED.has(value) ? value : null;
  } catch {
    // Private mode / blocked storage - no choice, so the store default.
    return null;
  }
}

// The server can't know what a browser chose, so it renders the store's
// default; the client switches after hydration only if the customer picked
// something else.
export function getServerDisplayCurrency() {
  return null;
}

export function subscribeToDisplayCurrency(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DISPLAY_CURRENCY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISPLAY_CURRENCY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveDisplayCurrency(currency) {
  const value = ALLOWED.has(currency) ? currency : "NGN";
  try {
    localStorage.setItem(DISPLAY_CURRENCY_KEY, value);
  } catch {
    /* storage blocked - the choice just won't survive a reload */
  }
  window.dispatchEvent(new Event(DISPLAY_CURRENCY_EVENT));
}
