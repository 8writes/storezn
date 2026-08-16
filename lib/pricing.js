// Shared by every place that needs what a product actually costs -
// cart totals, checkout order creation, offline orders, and storefront
// display all read through this instead of `price` directly, so the
// discount math only lives in one place. discountPercent only applies to
// the base product price - a variant's own price override is never
// discounted, see products.discountPercent in lib/db/schema.js.
export function getEffectivePrice(price, discountPercent) {
  if (!discountPercent) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}
