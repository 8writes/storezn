import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { orders, orderItems, orderTenders, cashMovements, products, productVariants } from "@/lib/db/schema.js";
import { validate, posSaleSchema } from "@/lib/validate.js";
import { generateOrderNumber, computeOrderTotals } from "@/lib/orders.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { reserveStock, OutOfStockError } from "@/lib/inventory.js";
import { toKobo, toNaira } from "@/lib/money.js";
import { validateTenders, drawerDeltaFromTenders } from "@/lib/pos.js";
import { posContext, loadSession } from "@/lib/posAccess.js";

const UNIQUE_VIOLATION = "23505";

// Settle a register sale. One transaction: reserve stock at the
// register's branch, insert the order (channel "pos", paid + delivered
// immediately), its lines, its tenders, and the cash-drawer movement for
// the cash portion. Idempotent on `idempotencyKey` via paymentReference.
export async function POST(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { user } = ctx;

  const body = await req.json().catch(() => null);
  const result = validate(posSaleSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const data = result.data;

  const sessionRow = await loadSession(storeId, data.sessionId, user);
  if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (sessionRow.session.status !== "open") {
    return NextResponse.json({ error: "This register session is closed - open a new one" }, { status: 409 });
  }
  const branchId = sessionRow.register.branchId;

  const paymentReference = `POS-${data.idempotencyKey}`;

  // Idempotent replay - the sale already went through on an earlier
  // attempt with this key.
  const [existing] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
  if (existing) {
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
    return NextResponse.json({ order: existing, items: lines, orderNumber: existing.orderNumber, replayed: true });
  }

  // Price overrides and any markdown are owner-only until the P2 manager
  // override lands (see the spec's phasing).
  const wantsPriceChange =
    data.items.some((i) => i.unitPrice != null || (i.lineDiscount || 0) > 0) || (data.discountAmount || 0) > 0;
  const isOwner = user.role === "vendor" || user.role === "super_admin";
  if (wantsPriceChange && !isOwner) {
    return NextResponse.json({ error: "Only the store owner can override prices or apply a discount right now" }, { status: 403 });
  }

  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const variantIds = [...new Set(data.items.map((i) => i.variantId).filter(Boolean))];
  const [productRows, variantRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds))),
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [],
  ]);
  const productById = new Map(productRows.map((p) => [p.id, p]));
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const resolved = [];
  for (const item of data.items) {
    const product = productById.get(item.productId);
    if (!product) return NextResponse.json({ error: "A product on this sale is no longer in your catalogue" }, { status: 404 });
    if (!product.isActive || product.suspendedAt) {
      return NextResponse.json({ error: `${product.name} is not available for sale` }, { status: 409 });
    }
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (item.variantId && (!variant || variant.productId !== product.id)) {
      return NextResponse.json({ error: `${product.name}: that option doesn't exist` }, { status: 404 });
    }

    const catalogueNaira = variant?.price ?? getEffectivePrice(product.price, product.discountPercent);
    const overridden = item.unitPrice != null && toKobo(item.unitPrice) !== toKobo(catalogueNaira);
    const unitKobo = item.unitPrice != null ? toKobo(item.unitPrice) : toKobo(catalogueNaira);

    const maxLineDiscount = unitKobo * item.quantity;
    const lineDiscountKobo = Math.min(toKobo(item.lineDiscount || 0), maxLineDiscount);
    const lineTotalKobo = unitKobo * item.quantity - lineDiscountKobo;

    resolved.push({
      product,
      variant,
      quantity: item.quantity,
      unitKobo,
      lineDiscountKobo,
      lineTotalKobo,
      overridden,
      originalUnitPrice: overridden ? catalogueNaira : null,
    });
  }

  const subtotalKobo = resolved.reduce((s, r) => s + r.lineTotalKobo, 0);
  const discountAmountKobo = Math.min(toKobo(data.discountAmount || 0), subtotalKobo);
  const totalKobo = subtotalKobo - discountAmountKobo;

  const tendersKobo = data.tenders.map((t) => ({
    method: t.method,
    amount: toKobo(t.amount),
    changeGiven: toKobo(t.changeGiven || 0),
    reference: t.reference || null,
  }));
  const tenderCheck = validateTenders(tendersKobo, totalKobo);
  if (!tenderCheck.ok) return NextResponse.json({ error: tenderCheck.error }, { status: 400 });

  // computeOrderTotals stays the single place order economics are
  // derived - for POS it just passes the (already discounted) subtotal
  // through with every platform fee at 0, exactly like a manual offline
  // order.
  const totals = computeOrderTotals({
    subtotal: toNaira(totalKobo),
    shippingFee: 0,
    commissionRatePercent: 0,
    feeChargedToCustomer: false,
  });

  // For a sale that was rung up offline and is only now reaching the
  // server, keep its real till time (bounded: not in the future, not
  // older than 7 days) rather than stamping it "now". The client also
  // generates the order number up front so the receipt it printed at the
  // counter matches this row; fall back to a server-generated one.
  const soldAt = (() => {
    if (!data.soldAt) return new Date();
    const t = new Date(data.soldAt);
    const ms = t.getTime();
    if (Number.isNaN(ms) || ms > Date.now() + 60_000 || ms < Date.now() - 7 * 24 * 60 * 60 * 1000) return new Date();
    return t;
  })();
  const now = soldAt;
  let orderNumber = data.orderNumber || generateOrderNumber();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await db.transaction(async (tx) => {
        await reserveStock(
          tx,
          resolved.map((r) => ({
            productId: r.product.id,
            variantId: r.variant?.id || null,
            quantity: r.quantity,
            productName: r.product.name,
            branchId,
          })),
          // A register sale never blocks on stock - see reserveStock.
          { allowNegative: true },
        );

        const [order] = await tx
          .insert(orders)
          .values({
            storeId,
            branchId,
            userId: null,
            orderNumber,
            guestEmail: data.buyerEmail || null,
            buyerName: data.buyerName || null,
            buyerPhone: data.buyerPhone || null,
            status: "delivered",
            paymentStatus: "paid",
            subtotal: toNaira(subtotalKobo),
            shippingFee: 0,
            totalAmount: totals.totalAmount,
            commissionRatePercent: 0,
            commissionAmount: totals.commissionAmount,
            flatFeeAmount: totals.flatFeeAmount,
            vendorPayoutAmount: totals.vendorPayoutAmount,
            feeChargedToCustomer: false,
            note: data.note || null,
            isOffline: true,
            channel: "pos",
            posSessionId: data.sessionId,
            discountAmount: discountAmountKobo,
            discountReason: data.discountReason || null,
            paymentReference,
            paidAt: now,
            deliveredAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await tx.insert(orderItems).values(
          resolved.map((r) => ({
            orderId: order.id,
            productId: r.product.id,
            variantId: r.variant?.id || null,
            productName: r.product.name,
            productImage: r.product.images?.[0] || null,
            variantLabel: r.variant ? Object.entries(r.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
            unitPrice: toNaira(r.unitKobo),
            quantity: r.quantity,
            lineTotal: toNaira(r.lineTotalKobo),
            originalUnitPrice: r.originalUnitPrice,
            lineDiscount: r.lineDiscountKobo,
            priceOverridden: r.overridden,
          })),
        );

        await tx.insert(orderTenders).values(
          tendersKobo.map((t) => ({
            orderId: order.id,
            method: t.method,
            amount: t.amount,
            changeGiven: t.changeGiven,
            reference: t.reference,
            sessionId: data.sessionId,
          })),
        );

        const cashIn = drawerDeltaFromTenders(tendersKobo);
        if (cashIn > 0) {
          await tx.insert(cashMovements).values({
            sessionId: data.sessionId,
            kind: "cash_sale",
            amount: cashIn,
            orderId: order.id,
            createdBy: user.id,
          });
        }

        return order;
      });

      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
      return NextResponse.json({ order: created, items: lines, orderNumber: created.orderNumber }, { status: 201 });
    } catch (err) {
      if (err instanceof OutOfStockError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      if (err?.code === UNIQUE_VIOLATION) {
        // Idempotent replay that raced this request in.
        const [dupe] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
        if (dupe) {
          const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, dupe.id));
          return NextResponse.json({ order: dupe, items: lines, orderNumber: dupe.orderNumber, replayed: true });
        }
        // Otherwise an orderNumber collision - regenerate and retry once.
        orderNumber = generateOrderNumber();
        continue;
      }
      throw err;
    }
  }

  return NextResponse.json({ error: "Could not complete the sale, try again" }, { status: 500 });
}
