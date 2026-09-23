import { NextResponse, after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { orders, orderItems, orderTenders, cashMovements, products, productVariants, posHeldSales } from "@/lib/db/schema.js";
import { validate, posSaleSchema } from "@/lib/validate.js";
import { generateOrderNumber, computeOrderTotals } from "@/lib/orders.js";
import { computeWholesalePrice } from "@/lib/pricing.js";
import { reserveStock, OutOfStockError } from "@/lib/inventory.js";
import { toKobo, toNaira, formatKobo } from "@/lib/money.js";
import { logStoreActivity, actorLabel } from "@/lib/storeActivity.js";
import { canReplayOfflineSale, posPriceAdjustmentPolicy, validateTenders } from "@/lib/pos.js";
import { posContext, loadSession, loadSessionAny } from "@/lib/posAccess.js";
import { buildPosSessionSummary, lockPosSession, reconcileClosedPosSession } from "@/lib/posSession.js";
import { logAppError } from "@/lib/appErrorLog.js";
import { withApiMonitoring } from "@/lib/apiMonitoring.js";

const UNIQUE_VIOLATION = "23505";

// Settle a register sale. One transaction: reserve stock at the
// register's branch, insert the order (channel "pos", paid + delivered
// immediately), its lines, its tenders, and the cash-drawer movement for
// the cash portion. Idempotent on `idempotencyKey` via paymentReference.
async function handlePost(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { user } = ctx;

  const body = await req.json().catch(() => null);
  const result = validate(posSaleSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const data = result.data;

  // A sale posted well after it was rung up is a queued offline replay
  // (a live ring-up reaches the server in seconds). Those get lenient
  // session handling below - the sale really happened, so a shift that
  // has since been closed, or a branch reassignment, must not strand it.
  const soldAtMs = data.soldAt ? new Date(data.soldAt).getTime() : NaN;
  const isDelayedSale = Number.isFinite(soldAtMs) && Date.now() - soldAtMs > 90_000;
  const isOfflineReplay = data.offlineReplay === true || isDelayedSale;

  // Live sales remain branch-scoped. A delayed queued sale may use its
  // original same-store session after a branch reassignment; its timestamp
  // is still required to fall inside that shift below.
  let sessionRow = await loadSession(storeId, data.sessionId, user);
  if (!sessionRow && isOfflineReplay) {
    const historicalSession = await loadSessionAny(storeId, data.sessionId);
    if (historicalSession?.session.status === "closed") sessionRow = historicalSession;
  }
  if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (isOfflineReplay) {
    const openedAtMs = new Date(sessionRow.session.openedAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (
      !Number.isFinite(soldAtMs) ||
      !Number.isFinite(openedAtMs) ||
      soldAtMs < openedAtMs ||
      soldAtMs < sevenDaysAgo ||
      soldAtMs > Date.now() + 60_000
    ) {
      return NextResponse.json({ error: "Offline sale timestamp is outside this register shift" }, { status: 409 });
    }
  }

  const canReplayClosedSession = isOfflineReplay && canReplayOfflineSale(sessionRow.session, soldAtMs);
  if (sessionRow.session.status !== "open" && !canReplayClosedSession) {
    return NextResponse.json({ error: "This register session is closed - open a new one" }, { status: 409 });
  }

  const settleSessionId = sessionRow.session.id;
  const branchId = sessionRow.register.branchId;

  const paymentReference = `POS-${data.idempotencyKey}`;

  // Idempotent replay - the sale already went through on an earlier
  // attempt with this key.
  const [existing] = await db.select().from(orders).where(and(eq(orders.paymentReference, paymentReference), eq(orders.storeId, storeId))).limit(1);
  if (existing) {
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
    return NextResponse.json({ order: existing, items: lines, orderNumber: existing.orderNumber, replayed: true });
  }
  const [foreignReference] = await db.select({ id: orders.id }).from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
  if (foreignReference) {
    return NextResponse.json({ error: "That sale reference has already been used" }, { status: 409 });
  }

  // Price overrides and any markdown are owner-only until the P2 manager
  // override lands (see the spec's phasing).
  const wantsPriceChange =
    data.items.some((i) => i.unitPrice != null || (i.lineDiscount || 0) > 0) || (data.discountAmount || 0) > 0;
  const isOwner = user.role === "vendor" || user.role === "super_admin";
  const initialPricePolicy = posPriceAdjustmentPolicy({ isOwner, wantsPriceChange, isOfflineReplay });
  if (initialPricePolicy.blocked) {
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

    // Catalogue price for this line. A variant carries its own flat unit
    // price; otherwise bundle/wholesale pricing gives a line total that
    // isn't a single unit price times quantity (10 at the bundle rate +
    // 1 loose at full price), so the LINE total is authoritative and the
    // stored unitPrice is just its average for display.
    const catalogueLineKobo = variant?.price != null
      ? toKobo(variant.price) * item.quantity
      : toKobo(computeWholesalePrice(product, item.quantity).total);
    const catalogueUnitKobo = item.quantity > 0 ? Math.round(catalogueLineKobo / item.quantity) : catalogueLineKobo;

    const capturedLineKobo = isOfflineReplay && item.capturedLineTotal != null ? toKobo(item.capturedLineTotal) : null;
    const baseLineKobo = capturedLineKobo != null
      ? capturedLineKobo
      : item.unitPrice != null
        ? toKobo(item.unitPrice) * item.quantity
        : catalogueLineKobo;
    const unitKobo = item.quantity > 0 ? Math.round(baseLineKobo / item.quantity) : baseLineKobo;
    const overridden = baseLineKobo !== catalogueLineKobo;

    const lineDiscountKobo = Math.min(toKobo(item.lineDiscount || 0), baseLineKobo);
    const lineTotalKobo = baseLineKobo - lineDiscountKobo;

    resolved.push({
      product,
      variant,
      quantity: item.quantity,
      unitKobo,
      capturedLineKobo: baseLineKobo,
      catalogueLineKobo,
      lineDiscountKobo,
      lineTotalKobo,
      overridden,
      originalUnitPrice: overridden ? toNaira(catalogueUnitKobo) : null,
    });
  }

  // The cashier already completed an offline sale at the price cached on
  // their device. Catalogue drift must not strand that real sale: settle it
  // at the captured price and put it in the owner's audit queue. Explicit
  // staff-entered overrides/discounts remain blocked by wantsPriceChange.
  const offlinePriceDrift = posPriceAdjustmentPolicy({
    isOwner,
    wantsPriceChange,
    isOfflineReplay,
    hasPriceDifference: resolved.some((line) => line.overridden),
  }).reviewRequired;

  const subtotalKobo = resolved.reduce((s, r) => s + r.lineTotalKobo, 0);
  const discountAmountKobo = Math.min(toKobo(data.discountAmount || 0), subtotalKobo);
  const totalKobo = subtotalKobo - discountAmountKobo;
  if (!Number.isSafeInteger(totalKobo) || totalKobo < 0 || totalKobo > 2_000_000_000) {
    return NextResponse.json({ error: "Sale total is outside the supported POS range" }, { status: 400 });
  }

  const tendersKobo = data.tenders.map((t) => ({
    method: t.method,
    // Provider account: a POS terminal for a card swipe, the same
    // provider's bank account for a transfer.
    provider: (t.method === "card" || t.method === "transfer") && t.provider ? t.provider.trim() : null,
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
        const lockedSession = await lockPosSession(tx, settleSessionId);
        if (!lockedSession) throw new Error("Session disappeared while settling sale");
        const lockedReplayAllowed = lockedSession.status === "closed" && canReplayClosedSession;
        if (lockedSession.status !== "open" && !lockedReplayAllowed) {
          const error = new Error("This register session is closed - open a new one");
          error.code = "POS_SESSION_CLOSED";
          throw error;
        }
        if (lockedSession.status === "open" && !isOfflineReplay) {
          const drawerDelta = tendersKobo.reduce(
            (sum, tender) => sum + (tender.method === "cash" ? tender.amount : 0) - Number(tender.changeGiven || 0),
            0,
          );
          if (drawerDelta < 0) {
            const summary = await buildPosSessionSummary(tx, lockedSession);
            if (summary.drawer.expectedCash + drawerDelta < 0) {
              const error = new Error("Not enough expected cash in this drawer to give that change");
              error.code = "INSUFFICIENT_DRAWER_CASH";
              throw error;
            }
          }
        }
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
            soldById: user.id,
            soldByName: actorLabel(user),
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
            posSessionId: settleSessionId,
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
            provider: t.provider,
            amount: t.amount,
            changeGiven: t.changeGiven,
            reference: t.reference,
            sessionId: settleSessionId,
          })),
        );

        // Two distinct things can happen to the drawer on one sale, and
        // they're logged as two separate movements so the Z report reads
        // honestly (rather than one net "cash_sale" that goes negative
        // when it's really change handed out on a card/transfer order):
        //   1. cash actually taken in for cash tenders  -> `cash_sale`
        //   2. cash change handed back on a POS/transfer overpayment
        //      -> `change_out` (its own kind: not a sale, not a
        //      discretionary paid-out).
        // Late offline sales still write their real drawer effects. When
        // the shift is already closed its frozen Z is rebuilt below.
        {
          const cashTakenIn = tendersKobo.reduce(
            (s, t) => (t.method === "cash" ? s + (t.amount - Number(t.changeGiven || 0)) : s),
            0,
          );
          const changeTenders = tendersKobo.filter(
            (t) => t.method !== "cash" && Number(t.changeGiven || 0) > 0,
          );
          const changeFromDrawer = changeTenders.reduce((s, t) => s + Number(t.changeGiven || 0), 0);
          const rows = [];
          if (cashTakenIn !== 0) {
            rows.push({ sessionId: settleSessionId, kind: "cash_sale", amount: cashTakenIn, orderId: order.id, createdBy: user.id });
          }
          if (changeFromDrawer > 0) {
            // Name the account the customer overpaid on, so the drawer
            // shortfall traces back to a specific POS terminal / bank
            // account: "Opay POS", "Moniepoint transfer", or just "POS" /
            // "a bank transfer" when the cashier didn't pick a provider.
            const accounts = [
              ...new Set(
                changeTenders.map((t) => {
                  const kind = t.method === "card" ? "POS" : "transfer";
                  return t.provider ? `${t.provider} ${kind}` : t.method === "card" ? "POS" : "a bank transfer";
                }),
              ),
            ].join(" + ");
            rows.push({
              sessionId: settleSessionId,
              kind: "change_out",
              amount: -changeFromDrawer,
              orderId: order.id,
              createdBy: user.id,
              reason: `Cash change from an overpayment on ${accounts}`,
            });
          }
          if (rows.length) await tx.insert(cashMovements).values(rows);
        }

        if (data.heldSaleId) {
          await tx.delete(posHeldSales).where(and(eq(posHeldSales.id, data.heldSaleId), eq(posHeldSales.sessionId, settleSessionId)));
        }
        if (lockedSession.status === "closed") {
          await reconcileClosedPosSession(tx, lockedSession);
        }

        return order;
      });

      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, created.id));

      const itemCount = resolved.reduce((n, r) => n + r.quantity, 0);
      const anyOverride = resolved.some((r) => r.overridden) || discountAmountKobo > 0;
      const priceDriftLines = offlinePriceDrift
        ? resolved
            .filter((r) => r.overridden)
            .map((r) => ({
              productId: r.product.id,
              variantId: r.variant?.id || null,
              productName: r.product.name,
              quantity: r.quantity,
              capturedLineKobo: r.capturedLineKobo,
              catalogueLineKobo: r.catalogueLineKobo,
              varianceKobo: r.capturedLineKobo - r.catalogueLineKobo,
            }))
        : [];
      // "cash", "POS (Moniepoint)", "transfer (Opay)" ... joined for a split.
      const payLabel = tendersKobo
        .map((t) => {
          const base = t.method === "card" ? "POS" : t.method;
          return `${base}${t.provider ? ` (${t.provider})` : ""}`;
        })
        .join(" + ");
      const changeKobo = tendersKobo.reduce((s, t) => s + t.changeGiven, 0);
      const priceAdjustments = resolved
        .filter((line) => line.overridden || line.lineDiscountKobo > 0)
        .map((line) => ({
          productId: line.product.id,
          variantId: line.variant?.id || null,
          productName: line.product.name,
          quantity: line.quantity,
          catalogueUnitKobo: line.catalogueUnitKobo,
          adjustedUnitKobo: line.unitKobo,
          lineDiscountKobo: line.lineDiscountKobo,
        }));
      after(() =>
        logStoreActivity({
          storeId,
          actor: user,
          branchId,
          action: anyOverride ? "pos.sale.adjusted" : "pos.sale",
          summary:
            `Rang up ${formatKobo(totalKobo)} - ${itemCount} item${itemCount === 1 ? "" : "s"} - ${payLabel}` +
            (changeKobo > 0 ? ` - ${formatKobo(changeKobo)} cash change from drawer` : "") +
            (discountAmountKobo > 0 ? ` - ${formatKobo(discountAmountKobo)} off` : "") +
            (offlinePriceDrift ? " - offline price changed; review required" : resolved.some((r) => r.overridden) ? " - price overridden" : "") +
            (settleSessionId !== data.sessionId ? " - synced to current shift" : ""),
          targetType: "order",
          targetId: created.id,
          metadata: {
            orderNumber: created.orderNumber,
            totalKobo,
            itemCount,
            discountKobo: discountAmountKobo,
            discountReason: data.discountReason || null,
            overridden: resolved.some((r) => r.overridden),
            priceAdjustments,
            offlinePriceDrift,
            priceDriftLines,
            rehomed: settleSessionId !== data.sessionId,
            tenders: tendersKobo.map((t) => ({ method: t.method, provider: t.provider, amountKobo: t.amount, changeKobo: t.changeGiven })),
          },
          flaggedAt: offlinePriceDrift ? new Date() : null,
          flagNote: offlinePriceDrift ? "Offline sale used a cached price that differs from the current catalogue." : null,
        }),
      );

      return NextResponse.json({ order: created, items: lines, orderNumber: created.orderNumber }, { status: 201 });
    } catch (err) {
      if (err instanceof OutOfStockError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      if (err?.code === UNIQUE_VIOLATION) {
        // Idempotent replay that raced this request in.
        const [dupe] = await db.select().from(orders).where(and(eq(orders.paymentReference, paymentReference), eq(orders.storeId, storeId))).limit(1);
        if (dupe) {
          const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, dupe.id));
          return NextResponse.json({ order: dupe, items: lines, orderNumber: dupe.orderNumber, replayed: true });
        }
        const [foreignDupe] = await db.select({ id: orders.id }).from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
        if (foreignDupe) {
          return NextResponse.json({ error: "That sale reference has already been used" }, { status: 409 });
        }
        // Otherwise an orderNumber collision - regenerate and retry once.
        orderNumber = generateOrderNumber();
        continue;
      }
      if (["POS_SESSION_CLOSED", "INSUFFICIENT_DRAWER_CASH"].includes(err?.code)) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      await logAppError(err, {
        req,
        user,
        source: "pos.sale",
        storeId,
        metadata: { sessionId: data.sessionId, paymentReference, itemCount: data.items.length, totalKobo },
      });
      throw err;
    }
  }

  return NextResponse.json({ error: "Could not complete the sale, try again" }, { status: 500 });
}

export const POST = withApiMonitoring(handlePost, { source: "vendor.pos.sale" });
