import { isEnterpriseStore, isPlusStore } from "./storePlan.js";

// Drops sidebar links the active store's plan can't use, so a free vendor
// isn't shown pages that only open an upgrade screen. Items opt in with
// `plan: "plus" | "enterprise"`; everything else always shows. Each page
// still enforces its own gate - this only stops advertising it. Groups
// left empty are removed. With no store loaded yet, gated items are hidden
// (they reappear once the store arrives).
export function filterNavForStore(groups, store, now) {
  const allowed = (item) => {
    if (item.plan === "enterprise") return !!store && isEnterpriseStore(store, now);
    if (item.plan === "plus") return !!store && isPlusStore(store, now);
    return true;
  };
  return groups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0);
}
