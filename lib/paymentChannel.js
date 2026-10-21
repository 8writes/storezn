// How an online (Paystack) payment was made, in plain words. Paystack's
// Transaction Verify reports it as `channel` and it's stored on
// orders.paymentChannel. Client-safe.

const LABELS = {
  card: "Card",
  bank_transfer: "Bank transfer",
  bank: "Bank account",
  ussd: "USSD",
  apple_pay: "Apple Pay",
  qr: "QR code",
  mobile_money: "Mobile money",
  eft: "EFT",
};

// Paystack's channel string, kept only if it looks like one (lowercase
// word) - anything else is dropped rather than stored.
export function normalisePaymentChannel(channel) {
  const value = String(channel ?? "").trim().toLowerCase();
  return /^[a-z_]{1,30}$/.test(value) ? value : null;
}

// "Card (online)", or just "Online" for an online order paid before the
// channel was recorded.
export function onlinePaymentLabel(channel) {
  const name = LABELS[channel] || (channel ? channel.replace(/_/g, " ") : null);
  return name ? `${name} (online)` : "Online";
}
