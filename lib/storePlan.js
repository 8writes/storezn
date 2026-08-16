// A cancelled or payment-failed subscription keeps Plus access until the
// paid period actually ends (see stores.planCancelled/planRenewsAt) -
// every feature gate reads through this instead of the raw stores.plan
// column, so a lapsed subscription self-heals to "free" on next read
// without needing a cron job to expire it. stores.plan itself is only
// ever flipped to "free" by the Paystack webhook handler once it's
// confirmed gone (subscription.disable).
export function getEffectivePlan(store) {
  if (
    store?.plan === "plus" &&
    store.planCancelled &&
    store.planRenewsAt &&
    new Date(store.planRenewsAt) < new Date()
  ) {
    return "free";
  }
  return store?.plan || "free";
}

export function isPlusStore(store) {
  return getEffectivePlan(store) === "plus";
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
