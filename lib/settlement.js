// Paystack settles split-payment sub-accounts on the same T+1 schedule as
// its main account - money charged today lands in the vendor's bank the
// next business day, not instantly (see lib/paystack.js's
// initializeTransaction, "bearer: account"). Weekends push it to the
// following Monday; this doesn't know about Nigerian public holidays
// (Paystack's own schedule already accounts for those), so it's an
// estimate for display only - lib/settlementSync.js's syncStoreSettlements
// is what actually confirms settlement via Paystack's Settlements API and
// sets orders.settledAt, this is just the "expected by" hint shown while
// that's still null.
export function estimatedSettlementDate(paidAt) {
  const d = new Date(paidAt);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
