import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { orders, orderItems, orderTenders, cashMovements } from "@/lib/db/schema.js";
import { validate, posReturnSchema } from "@/lib/validate.js";
import { generateOrderNumber } from "@/lib/orders.js";
import { restockItems } from "@/lib/inventory.js";
import { toKobo, toNaira } from "@/lib/money.js";
import { posContext, loadSession } from "@/lib/posAccess.js";

// A till return. Creates a linked NEGATIVE order (the original is never
// touched - history stays additive), restocks the returned units at the
// branch the sale came from, and records the cash going back out of the
// drawer. Owner-only for now (returns move up to staff with the P2
// manager override).
export async function POST(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { user } = ctx;
  if (user.role !== "vendor" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Only the store owner can process a return right now" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const result = validate(posReturnSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const data = result.data;

  const sessionRow = await loadSession(storeId, data.sessionId, user);
  if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (sessionRow.session.status !== "open") {
    return NextResponse.json({ error: "Open a register session before processing a return" }, { status: 409 });
  }

  const [original] = await db.select().from(orders).where(eq(orders.id, data.originalOrderId)).limit(1);
  if (!original || original.storeId !== storeId) {
    return NextResponse.json({ error: "Original sale not found" }, { status: 404 });
  }
  if (original.originalOrderId || original.paymentStatus !== "paid" || Number(original.totalAmount) < 0) {
    return NextResponse.json({ error: "That order can't be returned against" }, { status: 409 });
  }

  const originalItems = await db.select().from(orderItems).where(eq(orderItems.orderId, original.id));
  const priorReturns = await db.select({ id: orders.id }).from(orders).where(eq(orders.originalOrderId, original.id));
  // returned-so-far per original line (quantities on prior returns are
  // stored negative)
  const returnedByItem = new Map();
  for (const pr of priorReturns) {
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, pr.id));
    for (const l of lines) {
      const key = l.productId + (l.variantId || "");
      returnedByItem.set(key, (returnedByItem.get(key) || 0) + Math.abs(l.quantity));
    }
  }

  const returnLines = [];
  let refundKoboRaw = 0;
  for (const line of data.items) {
    const item = originalItems.find((i) => i.id === line.orderItemId);
    if (!item) return NextResponse.json({ error: "A line isn't part of that sale" }, { status: 404 });
    const key = item.productId + (item.variantId || "");
    const alreadyReturned = returnedByItem.get(key) || 0;
    if (line.quantity + alreadyReturned > item.quantity) {
      return NextResponse.json({ error: `${item.productName}: more returned than were sold` }, { status: 409 });
    }
    const perUnitKobo = Math.round(toKobo(item.lineTotal) / item.quantity);
    const lineRefundKobo = perUnitKobo * line.quantity;
    refundKoboRaw += lineRefundKobo;
    returnLines.push({ item, quantity: line.quantity, lineRefundKobo });
  }

  // Distribute the original order-level discount across the refund so a
  // partial return of a discounted sale refunds proportionally.
  const scale =
    toKobo(original.subtotal) > 0 ? toKobo(original.totalAmount) / toKobo(original.subtotal) : 1;
  const refundKobo = Math.round(refundKoboRaw * scale);

  const now = new Date();
  const returnOrder = await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(orders)
      .values({
        storeId,
        branchId: original.branchId,
        userId: null,
        orderNumber: generateOrderNumber(),
        buyerName: original.buyerName,
        buyerPhone: original.buyerPhone,
        guestEmail: original.guestEmail,
        status: "refunded",
        paymentStatus: "paid",
        subtotal: -toNaira(refundKobo),
        shippingFee: 0,
        totalAmount: -toNaira(refundKobo),
        commissionRatePercent: 0,
        commissionAmount: 0,
        flatFeeAmount: 0,
        vendorPayoutAmount: -toNaira(refundKobo),
        feeChargedToCustomer: false,
        note: `Return against ${original.orderNumber}`,
        isOffline: true,
        channel: "pos",
        posSessionId: data.sessionId,
        originalOrderId: original.id,
        paymentReference: `POSRET-${crypto.randomUUID()}`,
        paidAt: now,
      })
      .returning();

    await tx.insert(orderItems).values(
      returnLines.map((rl) => ({
        orderId: ret.id,
        productId: rl.item.productId,
        variantId: rl.item.variantId,
        productName: rl.item.productName,
        productImage: rl.item.productImage,
        variantLabel: rl.item.variantLabel,
        unitPrice: rl.item.unitPrice,
        quantity: -rl.quantity,
        lineTotal: -toNaira(rl.lineRefundKobo),
      })),
    );

    await restockItems(
      tx,
      returnLines.map((rl) => ({
        productId: rl.item.productId,
        variantId: rl.item.variantId,
        quantity: rl.quantity,
        branchId: original.branchId,
      })),
    );

    const refundMethod = data.refundMethod === "transfer" || data.refundMethod === "card" ? data.refundMethod : "cash";
    await tx.insert(orderTenders).values({
      orderId: ret.id,
      method: refundMethod,
      amount: -refundKobo,
      changeGiven: 0,
      reference: data.reference || null,
      sessionId: data.sessionId,
    });

    if (data.refundMethod === "cash") {
      await tx.insert(cashMovements).values({
        sessionId: data.sessionId,
        kind: "cash_refund",
        amount: -refundKobo,
        orderId: ret.id,
        createdBy: user.id,
      });
    }

    return ret;
  });

  return NextResponse.json({ order: returnOrder, refundAmount: toNaira(refundKobo) }, { status: 201 });
}
