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

// Wholesale / bundle pricing. Each tier in product.priceTiers is a
// BUNDLE: { bundleQty, unitPrice } means "every whole group of
// `bundleQty` units is charged `unitPrice` each". Whatever is left over
// after the biggest bundles that fit is charged the normal
// (discount-adjusted) base price. Bundles are filled largest-first, and
// the loop keeps going with smaller bundles for the remainder - so with
// bundles of 50 and 10, a qty of 63 is 1x50 + 1x10 + 3 loose.
//
//   base ₦1,000, one bundle { bundleQty: 10, unitPrice: 900 }, qty 11
//     -> 10 x ₦900  +  1 x ₦1,000  =  ₦10,000
//
// Set bundle sizes that nest (10, 50, 100) so the remainder never gets
// charged full price when a smaller bundle would still have fit.
//
// A variant's own price override is the caller's job and is never
// bundled, same as discountPercent.
export function computeWholesalePrice(product, quantity = 1) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const base = getEffectivePrice(Number(product?.price) || 0, product?.discountPercent);
  const bundles = (Array.isArray(product?.priceTiers) ? product.priceTiers : [])
    .map((t) => ({ size: Math.trunc(Number(t.bundleQty ?? t.minQty)), unitPrice: Number(t.unitPrice) }))
    .filter((b) => Number.isFinite(b.size) && b.size >= 2 && Number.isFinite(b.unitPrice) && b.unitPrice >= 0)
    .sort((a, b) => b.size - a.size);

  let left = qty;
  let total = 0;
  const segments = [];
  for (const b of bundles) {
    if (left < b.size) continue;
    const units = Math.floor(left / b.size) * b.size;
    total += units * b.unitPrice;
    left -= units;
    segments.push({ quantity: units, unitPrice: b.unitPrice, bundleSize: b.size });
  }
  if (left > 0) {
    total += left * base;
    segments.push({ quantity: left, unitPrice: base, bundleSize: null });
  }
  return { total, unitAverage: qty > 0 ? total / qty : base, segments };
}

// Fields that must never reach a shopper. Run every products row through
// this before it goes into a storefront/marketplace/public response.
export function stripInternalProductFields(row) {
  if (!row || typeof row !== "object") return row;
  const { costPrice, cost_price, expiryDate, expiry_date, ...rest } = row;
  return rest;
}
