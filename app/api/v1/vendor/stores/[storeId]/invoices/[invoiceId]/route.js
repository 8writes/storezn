import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import { invoiceItems, invoicePayments, invoiceRequests, invoices, orders, stores } from "../../../../../../../../lib/db/schema.js";
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
  const now = new Date();
  const cancelled = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, loaded.invoice.id), eq(invoices.storeId, loaded.invoice.storeId))).for("update").limit(1);
    if (!invoice || invoice.status !== "sent" || invoice.amountPaid > 0) return false;
    const [pendingPayment] = await tx.select({ id: invoicePayments.id }).from(invoicePayments).where(and(eq(invoicePayments.invoiceId, invoice.id), eq(invoicePayments.status, "pending"))).limit(1);
    if (pendingPayment) return false;
    await tx.update(invoices).set({ status: "cancelled", amountDue: 0, updatedAt: now }).where(eq(invoices.id, invoice.id));
    if (invoice.orderId) await tx.update(orders).set({ status: "cancelled", paymentStatus: "failed", amountDue: 0, updatedAt: now }).where(eq(orders.id, invoice.orderId));
    if (invoice.requestId) await tx.update(invoiceRequests).set({ status: "cancelled", updatedAt: now }).where(eq(invoiceRequests.id, invoice.requestId));
    await releaseInvoiceInventoryHold(tx, invoice.id);
    return true;
  });
  if (!cancelled) return NextResponse.json({ error: "Only an unpaid invoice without an active payment can be cancelled" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export const GET = withApiMonitoring(handleGet, { source: "vendor.invoice.detail" });
export const PATCH = withApiMonitoring(handlePatch, { source: "vendor.invoice.cancel" });
