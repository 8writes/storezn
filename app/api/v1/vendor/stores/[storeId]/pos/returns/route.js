import { NextResponse, after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { orders, orderItems, orderTenders, cashMovements } from "@/lib/db/schema.js";
import { validate, posReturnSchema } from "@/lib/validate.js";
import { generateOrderNumber } from "@/lib/orders.js";
import { restockItems } from "@/lib/inventory.js";
import { toKobo, toNaira, formatKobo } from "@/lib/money.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { lockPosSession } from "@/lib/posSession.js";
import { logStoreActivity, actorLabel } from "@/lib/storeActivity.js";

function posError(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

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
  const paymentReference = `POSRET-${data.idempotencyKey}`;

  const sessionRow = await loadSession(storeId, data.sessionId, user);
  if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const [existing] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
  if (existing) {
    if (existing.storeId !== storeId || existing.originalOrderId !== data.originalOrderId) {
      return NextResponse.json({ error: "That idempotency key was already used" }, { status: 409 });
    }
    return NextResponse.json({ order: existing, refundAmount: Math.abs(Number(existing.totalAmount)), replayed: true });
  }

  let outcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const session = await lockPosSession(tx, data.sessionId);
      if (!session || session.storeId !== storeId) throw posError("Session not found", "NOT_FOUND", 404);
      if (session.status !== "open") throw posError("Open a register session before processing a return", "SESSION_CLOSED");

      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.originalOrderId}))`);
      const [replay] = await tx.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
      if (replay) return { order: replay, refundKobo: Math.abs(toKobo(replay.totalAmount)), replayed: true };

      const [original] = await tx.select().from(orders).where(eq(orders.id, data.originalOrderId)).limit(1);
      if (!original || original.storeId !== storeId) throw posError("Original sale not found", "NOT_FOUND", 404);
      if (original.channel !== "pos" || original.originalOrderId || original.paymentStatus !== "paid" || Number(original.totalAmount) < 0) {
        throw posError("That order can't be returned through POS", "INVALID_ORDER");
      }

      const originalItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, original.id));
      const priorReturns = await tx.select({ id: orders.id }).from(orders).where(eq(orders.originalOrderId, original.id));
      const returnedByItem = new Map();
      for (const previous of priorReturns) {
        const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, previous.id));
        for (const line of lines) {
          returnedByItem.set(line.productId + (line.variantId || ""),
            (returnedByItem.get(line.productId + (line.variantId || "")) || 0) + Math.abs(line.quantity));
        }
      }

      const returnLines = [];
      let refundKoboRaw = 0;
      for (const line of data.items) {
        const item = originalItems.find((candidate) => candidate.id === line.orderItemId);
        if (!item) throw posError("A line isn't part of that sale", "LINE_NOT_FOUND", 404);
        const key = item.productId + (item.variantId || "");
        const alreadyReturned = returnedByItem.get(key) || 0;
        if (line.quantity + alreadyReturned > item.quantity) {
          throw posError(`${item.productName}: more returned than were sold`, "OVER_RETURN");
        }
        const lineTotalKobo = toKobo(item.lineTotal);
        const perUnitKobo = Math.round(lineTotalKobo / item.quantity);
        const lineRefundKobo = line.quantity + alreadyReturned === item.quantity
          ? lineTotalKobo - perUnitKobo * alreadyReturned
          : perUnitKobo * line.quantity;
        refundKoboRaw += lineRefundKobo;
        returnLines.push({ item, quantity: line.quantity, lineRefundKobo });
      }

      const scale = toKobo(original.subtotal) > 0
        ? toKobo(original.totalAmount) / toKobo(original.subtotal)
        : 1;
      const refundKobo = Math.round(refundKoboRaw * scale);
      if (refundKobo <= 0) throw posError("Refund amount must be positive", "INVALID_REFUND", 400);
      const refundMethod = data.refundMethod || "cash";
      const [returnOrder] = await tx.insert(orders).values({
        storeId, branchId: original.branchId, userId: null, orderNumber: generateOrderNumber(),
        buyerName: original.buyerName, buyerPhone: original.buyerPhone, guestEmail: original.guestEmail,
        status: "refunded", paymentStatus: "paid", soldById: user.id, soldByName: actorLabel(user),
        subtotal: -toNaira(refundKobo), shippingFee: 0, totalAmount: -toNaira(refundKobo),
        commissionRatePercent: 0, commissionAmount: 0, flatFeeAmount: 0,
        vendorPayoutAmount: -toNaira(refundKobo), feeChargedToCustomer: false,
        note: `Return against ${original.orderNumber}`, isOffline: true, channel: "pos",
        posSessionId: data.sessionId, originalOrderId: original.id, paymentReference, paidAt: new Date(),
      }).returning();

      await tx.insert(orderItems).values(returnLines.map(({ item, quantity, lineRefundKobo }) => ({
        orderId: returnOrder.id, productId: item.productId, variantId: item.variantId,
        productName: item.productName, productImage: item.productImage, variantLabel: item.variantLabel,
        unitPrice: item.unitPrice, quantity: -quantity, lineTotal: -toNaira(lineRefundKobo),
      })));
      await restockItems(tx, returnLines.map(({ item, quantity }) => ({
        productId: item.productId, variantId: item.variantId, quantity, branchId: original.branchId,
      })));
      await tx.insert(orderTenders).values({
        orderId: returnOrder.id, method: refundMethod, amount: -refundKobo,
        changeGiven: 0, reference: data.reference || null, sessionId: data.sessionId,
      });
      if (refundMethod === "cash") {
        await tx.insert(cashMovements).values({
          sessionId: data.sessionId, kind: "cash_refund", amount: -refundKobo,
          orderId: returnOrder.id, createdBy: user.id,
        });
      }
      return { order: returnOrder, original, refundKobo, refundMethod, replayed: false };
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    if (/unique|duplicate key/i.test(error.message || "")) {
      const [winner] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
      if (winner?.storeId === storeId && winner.originalOrderId === data.originalOrderId) {
        return NextResponse.json({ order: winner, refundAmount: Math.abs(Number(winner.totalAmount)), replayed: true });
      }
    }
    throw error;
  }

  if (!outcome.replayed) {
    after(() => logStoreActivity({
      storeId, actor: user, branchId: outcome.original.branchId, action: "pos.return",
      summary: `Refunded ${formatKobo(outcome.refundKobo)} against ${outcome.original.orderNumber} (${outcome.refundMethod})`,
      targetType: "order", targetId: outcome.order.id,
      metadata: { refundKobo: outcome.refundKobo, refundMethod: outcome.refundMethod,
        originalOrderId: outcome.original.id, originalOrderNumber: outcome.original.orderNumber },
    }));
  }
  return NextResponse.json(
    { order: outcome.order, refundAmount: toNaira(outcome.refundKobo), replayed: outcome.replayed },
    { status: outcome.replayed ? 200 : 201 },
  );
}
