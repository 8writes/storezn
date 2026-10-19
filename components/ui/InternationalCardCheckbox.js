"use client";

// Vendor-side "the customer will pay with a card from outside Nigeria" on a
// manual or POS quote - the vendor answering the question the storefront
// quote form asks the customer. The invoice made from the request is then
// priced with the international card fee and paid by card or Apple Pay
// (lib/feePolicy.js). Only rendered for stores that accept international
// payments; the server ignores the flag everywhere else anyway.
export function InternationalCardCheckbox({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2.5 rounded-sm border border-slate-200 px-3 py-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 cursor-pointer"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">Customer will pay with a card from outside Nigeria</span>
        <span className="block text-xs text-slate-700 mt-0.5">
          The invoice uses the international card fee, and they pay by card or Apple Pay.
        </span>
      </span>
    </label>
  );
}
