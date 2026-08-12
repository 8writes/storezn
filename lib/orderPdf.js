import { jsPDF } from "jspdf";
import { formatDateTime } from "./format.js";

// jsPDF's standard fonts (Helvetica etc, the only ones available without
// embedding a custom font file) have no glyph for "₦" - format.js's
// formatCurrency renders it as a missing/garbled character AND throws
// off jsPDF's text-width math for right-aligned values, which is what
// was actually cutting the prices off. "NGN " is ASCII-safe.
function pdfCurrency(amount) {
  const n = Number(amount);
  if (amount == null || Number.isNaN(n)) return "NGN 0.00";
  const sign = n < 0 ? "-" : "";
  return `${sign}NGN ${Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Plain-text receipt/invoice, no jspdf-autotable (not a dependency) - just
// manually laid-out lines, which is all a receipt needs. Shared by the
// customer order page and the vendor order page, the only difference
// between the two is which totals section is passed in. totalsLines
// values are raw numbers, not pre-formatted strings - formatted here
// with pdfCurrency so every price in the document goes through the same
// PDF-safe formatter.
export function downloadOrderPdf({ order, items, storeName, shippingAddress, totalsLines }) {
  const doc = new jsPDF();
  const marginX = 14;
  let y = 20;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(storeName || "Order receipt", marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Order ${order.orderNumber}`, marginX, y);
  y += 5;
  doc.text(`Placed ${formatDateTime(order.createdAt)}`, marginX, y);
  y += 5;
  doc.text(`Status: ${order.status.replace(/_/g, " ")}`, marginX, y);
  y += 10;

  doc.setFont(undefined, "bold");
  doc.text("Items", marginX, y);
  y += 6;
  doc.setFont(undefined, "normal");
  for (const item of items) {
    const label = `${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ""} × ${item.quantity}`;
    doc.text(label, marginX, y);
    doc.text(pdfCurrency(item.lineTotal), 196, y, { align: "right" });
    y += 6;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(marginX, y, 196, y);
  y += 8;

  for (const line of totalsLines) {
    doc.setFont(undefined, line.bold ? "bold" : "normal");
    doc.text(line.label, marginX, y);
    doc.text(pdfCurrency(line.value), 196, y, { align: "right" });
    y += 6;
  }

  if (shippingAddress) {
    y += 8;
    doc.setFont(undefined, "bold");
    doc.text("Ship to", marginX, y);
    y += 6;
    doc.setFont(undefined, "normal");
    const lines = [
      shippingAddress.fullName,
      [shippingAddress.line1, shippingAddress.line2].filter(Boolean).join(", "),
      [shippingAddress.city, shippingAddress.state].filter(Boolean).join(", "),
      shippingAddress.phone,
    ].filter(Boolean);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += 6;
    }
  }

  doc.save(`${order.orderNumber}.pdf`);
}
