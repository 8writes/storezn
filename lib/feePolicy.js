// Which fee settings price an online order - local or international.
//
// A store that accepts international payments lets the customer say, at
// checkout, that they're paying with a card from outside Nigeria. Paystack
// charges those cards more, so such an order is priced with the platform's
// INTERNATIONAL rate / cap / flat fee instead of the local ones. Every
// other order - and every order on a store with international off - uses
// the local settings, including the store's own custom commission rate.
//
// The result feeds lib/orders.js's computeOrderTotals unchanged. One place
// for this, so the cart preview and the real checkout can never disagree.

// Payment methods an international card checkout offers. Bank transfer,
// USSD and bank need a Nigerian account, so they're left out.
export const INTERNATIONAL_CHANNELS = ["card", "apple_pay"];

// Only used if platform_settings somehow lacks the row/columns - the same
// "?? 5" style fallbacks the local path has always had.
const LOCAL_DEFAULT_RATE = 5;
const INTL_DEFAULT_RATE = 3.9;
const INTL_DEFAULT_FLAT_FEE = 100;

export function resolveFeePolicy({ store, settings, international = false }) {
  const isInternational = !!store?.internationalPaymentsEnabled && international === true;
  const feeChargedToCustomer = store?.feeChargedToCustomer ?? true;

  if (isInternational) {
    return {
      international: true,
      // Always the platform's international rate - a store's custom
      // (local) rate never applies here.
      commissionRatePercent: settings?.intlCommissionRatePercent ?? INTL_DEFAULT_RATE,
      flatFee: Math.max(0, Number(settings?.intlFlatFee ?? INTL_DEFAULT_FLAT_FEE) || 0),
      maxCommissionAmount: settings?.intlMaxCommissionAmount ?? null,
      feeChargedToCustomer,
      channels: INTERNATIONAL_CHANNELS,
    };
  }

  return {
    international: false,
    commissionRatePercent: store?.commissionRatePercent ?? settings?.defaultCommissionRatePercent ?? LOCAL_DEFAULT_RATE,
    flatFee: Math.max(0, Number(settings?.defaultFlatFee) || 0),
    maxCommissionAmount: settings?.maxCommissionAmount ?? null,
    feeChargedToCustomer,
    channels: null,
  };
}
