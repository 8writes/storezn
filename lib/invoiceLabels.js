// Plain words for invoice states, shared by the vendor invoice screens so
// they never show raw values like "partially_paid". Client-safe.

export const INVOICE_STATUS = {
  draft: { label: "Draft", color: "slate" },
  sent: { label: "Not paid", color: "amber" },
  partially_paid: { label: "Part paid", color: "blue" },
  paid: { label: "Paid", color: "green" },
  expired: { label: "Expired", color: "slate" },
  void: { label: "Void", color: "slate" },
  cancelled: { label: "Cancelled", color: "red" },
};

export function invoiceStatus(status) {
  return INVOICE_STATUS[status] || { label: String(status || "").replaceAll("_", " "), color: "slate" };
}

const PAYMENT_KIND = { full: "Full payment", deposit: "Deposit", balance: "Balance" };
const PAYMENT_STATUS = {
  pending: { label: "Waiting", color: "amber" },
  paid: { label: "Paid", color: "green" },
  failed: { label: "Didn't go through", color: "red" },
};

// The deposit as a whole percent of the total, worked out from the stored
// amounts (invoices keep depositAmount, not the percent chosen).
export function depositPercentOf(invoice) {
  const total = Number(invoice?.totalAmount);
  const deposit = Number(invoice?.depositAmount);
  if (!(total > 0) || !(deposit > 0)) return null;
  return Math.round((deposit / total) * 100);
}

export function paymentKindLabel(kind) {
  return PAYMENT_KIND[kind] || "Payment";
}

export function paymentStatus(status) {
  return PAYMENT_STATUS[status] || { label: String(status || "").replaceAll("_", " "), color: "slate" };
}

// A WhatsApp share link with the invoice message ready to send - straight
// to the customer's chat when their number is known (Nigerian 0... numbers
// become 234...), otherwise WhatsApp asks who to send it to.
export function whatsappInvoiceUrl({ phone, storeName, link }) {
  const text = `Here is your invoice${storeName ? ` from ${storeName}` : ""}. You can view and pay it here: ${link}`;
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  const to = digits.length >= 10 ? digits : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
