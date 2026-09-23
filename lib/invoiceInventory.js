import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { invoiceInventoryHolds, invoices } from "./db/schema.js";
import { restockItems } from "./inventory.js";

export async function releaseInvoiceInventoryHold(tx, invoiceId) {
  const holds = await tx
    .select()
    .from(invoiceInventoryHolds)
    .where(and(eq(invoiceInventoryHolds.invoiceId, invoiceId), isNull(invoiceInventoryHolds.releasedAt)))
    .for("update");
  if (holds.length === 0) return 0;

  await restockItems(tx, holds.map((hold) => ({
    productId: hold.productId,
    variantId: hold.variantId,
    branchId: hold.branchId,
    quantity: hold.quantity,
  })));
  await tx
    .update(invoiceInventoryHolds)
    .set({ releasedAt: new Date() })
    .where(and(eq(invoiceInventoryHolds.invoiceId, invoiceId), isNull(invoiceInventoryHolds.releasedAt)));
  return holds.length;
}

export async function releaseExpiredInvoiceHolds(now = new Date()) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(inArray(invoices.status, ["expired", "cancelled"]));
    let released = 0;
    for (const invoice of expired) released += await releaseInvoiceInventoryHold(tx, invoice.id);
    return released;
  });
}
