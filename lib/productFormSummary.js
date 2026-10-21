// The line under a collapsed "More options" on the product form: names
// only fields the vendor has switched on (never a hidden one), the first
// few, then "and more". "How it sells" is always in the section.
const LABELS = {
  variants: "variants",
  discount: "discount",
  costPrice: "cost price",
  priceTiers: "wholesale",
  customerFields: "customer details",
  sku: "SKU",
  expiryDate: "expiry date",
  slug: "web link",
};

export function moreOptionsSummary(fieldIds, hasField, max = 3) {
  const names = ["How it sells", ...fieldIds.filter((id) => LABELS[id] && hasField(id)).map((id) => LABELS[id])];
  if (names.length <= max + 1) {
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} and more`;
}
