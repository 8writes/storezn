import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

export function generateOrderNumber() {
  return `ORD-${nanoid()}`;
}

// Commission is computed on the subtotal only - the shipping fee passes
// through to the vendor untouched, since the platform isn't the one
// fulfilling delivery. maxCommissionAmount (platformSettings.
// maxCommissionAmount, admin-editable any time from /super-admin/settings,
// not a fixed constant) caps the platform's TOTAL take per order -
// commission + flat fee combined, not the percentage component alone -
// null/undefined means uncapped. The flat fee itself always stays fully
// intact when there's room for it; the percentage-based commission is
// what absorbs the reduction, down to (but never below) 0.
//
// feeChargedToCustomer (stores.feeChargedToCustomer - the vendor's own
// choice for their store, snapshotted per-order, see lib/db/schema.js)
// decides who actually pays the commission: false (default) means the
// vendor absorbs it, same as always - the buyer pays exactly subtotal +
// shipping, and commission comes out of the vendor's payout. true adds it
// on top instead, the buyer pays the extra and the vendor keeps the full
// subtotal + shipping.
export function computeOrderTotals({ subtotal, shippingFee, commissionRatePercent, flatFee = 0, feeChargedToCustomer = false, maxCommissionAmount }) {
  const requestedFlatFee = Math.max(0, Number(flatFee) || 0);
  let commissionAmount = Math.round(((subtotal * commissionRatePercent) / 100) * 100) / 100;
  if (maxCommissionAmount != null) commissionAmount = Math.min(commissionAmount, Math.max(0, maxCommissionAmount - requestedFlatFee));
  const vendorAmount = subtotal + shippingFee;
  // The payment processing fee is owed in both modes. The toggle only decides whether
  // it is added to the customer's charge or deducted from the vendor's
  // payout; the flat component must not disappear when the vendor absorbs it.
  let totalFee = commissionAmount + requestedFlatFee;
  // commissionRatePercent is always 0-100 (validated in
  // updatePlatformSettingsSchema/updateStoreStatusSchema) so the
  // percentage component alone can never exceed vendorAmount - but
  // flatFee has no such natural ceiling, and unlike commissionAmount it's
  // never reduced by maxCommissionAmount's cap either. On a small enough
  // order (e.g. a heavily discounted digital product) with the vendor
  // absorbing the fee, an admin-set flatFee alone can exceed the whole
  // order value. Capping the platform's total take at what the order is
  // actually worth - rather than just flooring vendorPayoutAmount at 0
  // afterward - keeps totalAmount/commissionAmount/flatFeeAmount/
  // vendorPayoutAmount internally consistent (they still sum correctly).
  // Not a risk when the customer pays the fee on top - the vendor always
  // keeps the full vendorAmount in that case regardless of fee size.
  // Rounded UP to a whole naira: ₦738.40 of fee is charged as ₦739.
  //
  // A percentage of an arbitrary subtotal lands on kobo almost every
  // time, and Nigeria has no sub-naira coin in circulation - so a
  // checkout total ending in .40 is a figure nobody can actually hand
  // over, and it reads as sloppy next to the clean prices around it.
  // Rounding up rather than to nearest keeps the fee from ever being
  // charged at less than it was calculated to be.
  //
  // Applied before the clamps below so the capped values stay whole, and
  // before the re-split, so commissionAmount + flatFeeAmount still sum to
  // exactly what the buyer was charged.
  totalFee = Math.ceil(totalFee);
  // Ceiling can push a capped fee a few kobo past the cap - the cap is
  // the platform's hard maximum take, so it wins.
  if (maxCommissionAmount != null) totalFee = Math.min(totalFee, Math.max(0, maxCommissionAmount));
  if (!feeChargedToCustomer && totalFee > vendorAmount) totalFee = vendorAmount;
  const totalAmount = feeChargedToCustomer ? vendorAmount + totalFee : vendorAmount;
  const vendorPayoutAmount = feeChargedToCustomer ? vendorAmount : vendorAmount - totalFee;
  // Re-split totalFee (which may have just been capped) back into its two
  // recorded components, preserving "flat fee stays whole first" - same
  // priority order the maxCommissionAmount cap above already uses.
  const flatFeeAmount = Math.min(requestedFlatFee, totalFee);
  commissionAmount = Math.round((totalFee - flatFeeAmount) * 100) / 100;
  return { totalAmount, commissionAmount, flatFeeAmount, platformFeeAmount: totalFee, vendorPayoutAmount };
}
