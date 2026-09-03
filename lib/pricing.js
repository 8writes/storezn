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

// Wholesale / quantity price breaks. Returns what one unit costs when
// buying `quantity` of this product: the highest tier whose minimum the
// quantity reaches, otherwise the normal (discount-adjusted) base price.
// A variant's own price override is the caller's job and is never
// tiered, same as discountPercent. product.priceTiers is
// [{ minQty, unitPrice }].
export function tieredUnitPrice(product, quantity = 1) {
  const tiers = Array.isArray(product?.priceTiers) ? product.priceTiers : [];
  let best = null;
  for (const t of tiers) {
    if (Number(quantity) >= Number(t.minQty) && (!best || Number(t.minQty) > Number(best.minQty))) best = t;
  }
  if (best) return Number(best.unitPrice);
  return getEffectivePrice(product.price, product.discountPercent);
}

// Fields that must never reach a shopper. Run every products row through
// this before it goes into a storefront/marketplace/public response.
export function stripInternalProductFields(row) {
  if (!row || typeof row !== "object") return row;
  const { costPrice, cost_price, ...rest } = row;
  return rest;
}
