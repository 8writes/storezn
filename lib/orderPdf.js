import { jsPDF } from "jspdf";
import { formatCurrency, formatDateTime } from "./format.js";

// Plain-text receipt/invoice, no jspdf-autotable (not a dependency) - just
// manually laid-out lines, which is all a receipt needs. Shared by the
// customer order page and the vendor order page, the only difference
// between the two is which totals section is passed in.
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
    doc.text(formatCurrency(item.lineTotal), 196, y, { align: "right" });
    y += 6;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(marginX, y, 196, y);
  y += 8;

  for (const line of totalsLines) {
    doc.setFont(undefined, line.bold ? "bold" : "normal");
    doc.text(line.label, marginX, y);
    doc.text(line.value, 196, y, { align: "right" });
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
