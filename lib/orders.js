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
export function computeOrderTotals({ subtotal, shippingFee, commissionRatePercent, flatFee = 0, feeChargedToCustomer = false, maxCommissionAmount }) {
  let commissionAmount = Math.round(((subtotal * commissionRatePercent) / 100) * 100) / 100;
  if (maxCommissionAmount != null) commissionAmount = Math.min(commissionAmount, maxCommissionAmount);
  // flatFee is never capped by maxCommissionAmount - that cap only exists
  // to keep the *percentage* component from scaling without bound on a
  // large order, a flat fee is already bounded by definition.
  const totalFee = commissionAmount + flatFee;
  const vendorAmount = subtotal + shippingFee;
  const totalAmount = feeChargedToCustomer ? vendorAmount + totalFee : vendorAmount;
  const vendorPayoutAmount = feeChargedToCustomer ? vendorAmount : vendorAmount - totalFee;
  return { totalAmount, commissionAmount, flatFeeAmount: flatFee, vendorPayoutAmount };
}
