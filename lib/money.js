// Naira <-> kobo at the API boundary. The wider app stores money as
// `real` naira (a known precision compromise); the register stores it as
// integer kobo because a cash drawer is physically counted and float
// rounding there is unacceptable. Everything POS-side works in kobo and
// converts once, here, at the edge - the same discipline lib/paystack.js
// already uses for the Paystack API.

// Naira (may be a float from the products table) -> integer kobo.
export function toKobo(naira) {
  return Math.round(Number(naira || 0) * 100);
}

// Integer kobo -> naira number, for writing back into a `real` column or
// display. Kept to 2dp so it round-trips cleanly.
export function toNaira(kobo) {
  return Math.round(Number(kobo || 0)) / 100;
}

// "₦1,234.50" style, from kobo. Mirrors lib/format.js formatCurrency but
// takes kobo so the POS UI never has to convert first.
export function formatKobo(kobo) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(toNaira(kobo));
}

// Rounds a kobo amount to the nearest whole naira - Nigeria has no
// sub-naira coin in circulation, so a cash tender/change figure is
// always a whole number. Used only for cash; card/transfer take exact
// amounts.
export function roundCashKobo(kobo) {
  return Math.round(Number(kobo || 0) / 100) * 100;
}
