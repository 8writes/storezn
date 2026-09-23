import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import { invoiceItems, invoiceRequests, invoices, orders, stores } from "../../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { releaseInvoiceInventoryHold } from "../../../../../../../../lib/invoiceInventory.js";
import { withApiMonitoring } from "../../../../../../../../lib/apiMonitoring.js";

async function load(req, params) {
  const user = await getUser(req);
  const { storeId, invoiceId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.storeId, storeId))).limit(1);
  if (!invoice) return { error: NextResponse.json({ error: "Invoice not found" }, { status: 404 }) };
  return { user, invoice };
}

async function handleGet(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, loaded.invoice.id));
  return NextResponse.json({ invoice: loaded.invoice, items });
}

async function handlePatch(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const body = await req.json().catch(() => null);
  if (body?.action !== "cancel") return NextResponse.json({ error: "Only invoice cancellation is supported" }, { status: 400 });
  if (["paid", "cancelled"].includes(loaded.invoice.status)) return NextResponse.json({ error: "This invoice cannot be cancelled" }, { status: 409 });
  const now = new Date();
  await db.transaction(async (tx) => {
    await releaseInvoiceInventoryHold(tx, loaded.invoice.id);
    await tx.update(invoices).set({ status: "cancelled", amountDue: 0, updatedAt: now }).where(and(eq(invoices.id, loaded.invoice.id), eq(invoices.status, loaded.invoice.status)));
    if (loaded.invoice.orderId) await tx.update(orders).set({ status: "cancelled", amountDue: 0, updatedAt: now }).where(eq(orders.id, loaded.invoice.orderId));
    if (loaded.invoice.requestId) await tx.update(invoiceRequests).set({ status: "cancelled", updatedAt: now }).where(eq(invoiceRequests.id, loaded.invoice.requestId));
  });
  return NextResponse.json({ ok: true });
}

export const GET = withApiMonitoring(handleGet, { source: "vendor.invoice.detail" });
export const PATCH = withApiMonitoring(handlePatch, { source: "vendor.invoice.cancel" });
