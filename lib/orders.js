import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

export function generateOrderNumber() {
  return `ORD-${nanoid()}`;
}

// Commission is computed on the subtotal only - the shipping fee passes
// through to the vendor untouched, since the platform isn't the one
// fulfilling delivery. maxCommissionAmount (platformSettings.
// maxCommissionAmount, admin-editable any time from /super-admin/settings,
// not a fixed constant) caps the commission amount per order - null/
// undefined means uncapped.
//
// feeChargedToCustomer (stores.feeChargedToCustomer - the vendor's own
// choice for their store, snapshotted per-order, see lib/db/schema.js)
// decides who actually pays the commission: false (default) means the
// vendor absorbs it, same as always - the buyer pays exactly subtotal +
// shipping, and commission comes out of the vendor's payout. true adds it
// on top instead, the buyer pays the extra and the vendor keeps the full
// subtotal + shipping. commissionRatePercent is always 0-100 (validated in
// updatePlatformSettingsSchema/updateStoreStatusSchema) and the cap (when
// set) is never negative, so commissionAmount can never exceed
// subtotal + shipping - no flooring needed for vendorPayoutAmount to stay
// non-negative.
export function computeOrderTotals({ subtotal, shippingFee, commissionRatePercent, feeChargedToCustomer = false, maxCommissionAmount }) {
  let commissionAmount = Math.round(((subtotal * commissionRatePercent) / 100) * 100) / 100;
  if (maxCommissionAmount != null) commissionAmount = Math.min(commissionAmount, maxCommissionAmount);
  const vendorAmount = subtotal + shippingFee;
  const totalAmount = feeChargedToCustomer ? vendorAmount + commissionAmount : vendorAmount;
  const vendorPayoutAmount = feeChargedToCustomer ? vendorAmount : vendorAmount - commissionAmount;
  return { totalAmount, commissionAmount, vendorPayoutAmount };
}
