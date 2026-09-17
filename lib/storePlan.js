// A cancelled or payment-failed subscription keeps Plus access until the
// paid period actually ends (see stores.planCancelled/planRenewsAt) -
// every feature gate reads through this instead of the raw stores.plan
// column, so a lapsed subscription self-heals to "free" on next read
// without needing a cron job to expire it. stores.plan itself is only
// ever flipped to "free" by the Paystack webhook handler once it's
// confirmed gone (subscription.disable).
// Plan tiers, low to high: "free" < "plus" < "enterprise". Enterprise is
// a superset of Plus (everything Plus has, plus the in-person / point-of-
// sale suite), so isPlusStore() is true for an Enterprise store too.
// Enterprise is only ever granted by the Storezn team off-platform (see
// /api/v1/super-admin/stores/[id]/manual-plus) - there's no self-serve
// checkout for it - but it lapses to free the same way a manual Plus
// term does once the paid period ends.
export function getEffectivePlan(store) {
  const paid = store?.plan === "plus" || store?.plan === "enterprise";
  if (
    paid &&
    store.planCancelled &&
    store.planRenewsAt &&
    new Date(store.planRenewsAt) < new Date()
  ) {
    return "free";
  }
  return store?.plan || "free";
}

export function isPlusStore(store) {
  const p = getEffectivePlan(store);
  return p === "plus" || p === "enterprise";
}

// The in-person / point-of-sale suite (registers, shifts & Z-reports,
// offline POS selling, cash-drawer movements,
// payment-account tracking, the month-end forensic report) is gated on
// this - a plain Storezn+ store does not get it.
export function isEnterpriseStore(store) {
  return getEffectivePlan(store) === "enterprise";
}

export function getStaffLimit(store, settings) {
  return isPlusStore(store) ? settings.plusStaffLimit : settings.freeStaffLimit;
}

export function getStorageLimitBytes(store, settings) {
  const mb = isPlusStore(store) ? settings.plusStorageMb : settings.freeStorageMb;
  return mb * 1024 * 1024;
}

// Every store always has at least its one default branch (see
// branches.isDefault in lib/db/schema.js) - this caps how many MORE a
// vendor can create, same "grace, don't destroy data" behavior as
// storage/staff: a store that already has extra branches from a lapsed
// subscription keeps them, this only blocks creating new ones past the
// limit.
export function getBranchLimit(store, settings) {
  return isPlusStore(store) ? settings.plusBranchLimit : settings.freeBranchLimit;
}

export function getProductLimit(store) {
  return isPlusStore(store) ? Infinity : 50;
}

export function getPlusMonthlyPrice(store, settings) {
  const basePrice = Number(settings?.plusMonthlyPrice ?? 5000);
  const hasNegotiatedPrice = store?.subscriptionPriceOverride != null && store?.subscriptionDiscountPercent == null;
  if (settings?.plusIntroDiscountPercent != null && !isPlusStore(store) && !hasNegotiatedPrice) {
    return Math.round(basePrice * (1 - Number(settings.plusIntroDiscountPercent) / 100) * 100) / 100;
  }
  return store?.subscriptionPriceOverride ?? basePrice;
}
