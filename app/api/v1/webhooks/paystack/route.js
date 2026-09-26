import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { orders, orderItems, carts, cartItems, users, customers, stores, storeSubscriptionTransactions, branches, productBranchStock, platformSettings } from "../../../../../lib/db/schema.js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { verifyWebhookSignature, verifyTransaction, updatePlan } from "../../../../../lib/paystack.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { formatCurrency } from "../../../../../lib/format.js";
import { sendPushToStore } from "../../../../../lib/push.js";
import { LOW_STOCK_THRESHOLD, reserveStock, restockItems, OutOfStockError } from "../../../../../lib/inventory.js";
import { findCheckoutAttemptByReference, finalizePaidCheckoutAttempt, failCheckoutAttemptAndReleaseStock } from "../../../../../lib/checkoutAttempts.js";
import { orderConfirmationHtml } from "../../../../../lib/orderNotifications.js";
import { logAppError } from "../../../../../lib/appErrorLog.js";
import { invoicePayments } from "../../../../../lib/db/schema.js";
import { reconcileInvoicePayment } from "../../../../../lib/invoicePayments.js";
import { sendInvoicePaymentNotifications } from "../../../../../lib/invoiceNotifications.js";
import { withApiMonitoring } from "../../../../../lib/apiMonitoring.js";

// Storezn+ subscription lifecycle - separate from the order-payment flow
// below, see lib/storePlan.js's getEffectivePlan for how these fields
// actually get enforced.

// paystackReference is unique, so this is the actual idempotency gate for
// the whole subscription flow below, not just a ledger write - a Paystack
// webhook retry (fired on any non-2xx response) or a replayed valid
// payload carries the identical reference, so onConflictDoNothing's
// `.returning()` comes back empty and the caller knows not to extend
// planRenewsAt a second time for a charge already recorded once.
async function recordSubscriptionTransaction({ storeId, amount, reference, paidAt }) {
  if (!storeId || !reference) return false;
  const [inserted] = await db
    .insert(storeSubscriptionTransactions)
    .values({ storeId, amount, paystackReference: reference, paidAt: paidAt ? new Date(paidAt) : new Date() })
    .onConflictDoNothing()
    .returning({ id: storeSubscriptionTransactions.id });
  return !!inserted;
}

// The initial subscribe payment - we generate this charge ourselves (see
// POST /api/v1/vendor/stores/[storeId]/subscribe), so it carries our own
// "STOREZNSUB-" reference and metadata.storeId.
async function handleSubscriptionCharge(event) {
  const storeId = event.data?.metadata?.storeId;
  if (!storeId) return;
  // Same bar as an order payment below: never grant paid access off the
  // webhook payload alone. This endpoint is reachable directly, not only
  // through the trusted forwarder, and a charge can also be reversed
  // after the fact - so re-confirm with Paystack and record the amount
  // Paystack reports, not the amount the payload claims.
  const verified = await verifyTransaction(event.data?.reference);
  if (verified.paymentStatus !== "PAID") return;
  const isNewCharge = await recordSubscriptionTransaction({
    storeId,
    amount: verified.amountPaid,
    reference: event.data?.reference,
    paidAt: event.data?.paid_at,
  });
  // Already recorded this exact charge - a redelivered/replayed webhook
  // must not push planRenewsAt another 31 days out for free.
  if (!isNewCharge) return;
  // charge.success fires before subscription.create - this just marks the
  // store Plus immediately so the vendor isn't waiting on two webhooks in
  // sequence; subscription.create (below) fills in the authoritative
  // subscription code/token/renewal date moments later.
  await db
    .update(stores)
    .set({ plan: "plus", planCancelled: false, planRenewsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) })
    .where(eq(stores.id, storeId));
}

// Every renewal after the first - Paystack initiates these itself, so
// they carry Paystack's own reference (never "STOREZNSUB-") and no
// metadata, but do carry `data.plan`/`data.subscription_code`, which is
// how the caller below tells these apart from a regular order payment.
async function handleSubscriptionRenewal(event) {
  const subscriptionCode = event.data?.subscription_code;
  // A renewal must identify the exact Paystack subscription. Falling back to
  // owner email can attach an ordinary order (or a multi-store owner's
  // payment) to the wrong store's billing ledger.
  if (!subscriptionCode) return;
  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.paystackSubscriptionCode, subscriptionCode))
    .limit(1);
  if (!store) return;
  const storeId = store.id;

  const verified = await verifyTransaction(event.data?.reference);
  if (verified.paymentStatus !== "PAID") return;
  const isNewCharge = await recordSubscriptionTransaction({
    storeId,
    amount: verified.amountPaid,
    reference: event.data?.reference,
    paidAt: event.data?.paid_at,
  });
  if (!isNewCharge) return;

  await db
    .update(stores)
    .set({ plan: "plus", planCancelled: false, planRenewsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) })
    .where(eq(stores.id, storeId));
}

async function findStoreForSubscriptionEvent(event) {
  const subscriptionCode = event.data?.subscription_code || event.data?.subscription?.subscription_code;
  if (subscriptionCode) {
    const [store] = await db.select().from(stores).where(eq(stores.paystackSubscriptionCode, subscriptionCode)).limit(1);
    if (store) return store;
  }

  const email = event.data?.customer?.email;
  const planCode =
    event.data?.plan?.plan_code ||
    event.data?.plan_code ||
    event.data?.subscription?.plan?.plan_code;

  // A discounted store has a dedicated Paystack plan, which identifies it
  // more reliably than owner email when one owner has multiple stores.
  if (planCode) {
    const [store] = await db.select().from(stores).where(eq(stores.paystackPlanCodeOverride, planCode)).limit(1);
    if (store) return store;
  }
  if (email) {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (owner) {
      const [store] = await db.select().from(stores).where(eq(stores.ownerId, owner.id)).limit(1);
      if (store) return store;
    }
  }
  return null;
}

async function consumeIntroDiscount(store) {
  if (store.subscriptionDiscountPercent == null || !store.paystackPlanCodeOverride) return false;
  // Percentage discounts are introductory: the plan charges the discounted
  // first month, then this webhook restores the normal amount for the next
  // invoice and consumes the offer. Throwing on a Paystack failure makes the
  // webhook retry instead of silently leaving a permanent discount behind.
  const [settings] = await db
    .select({ plusMonthlyPrice: platformSettings.plusMonthlyPrice })
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);
  await updatePlan(store.paystackPlanCodeOverride, {
    amount: settings?.plusMonthlyPrice ?? 5000,
    updateExistingSubscriptions: true,
  });
  await db
    .update(stores)
    .set({ subscriptionDiscountPercent: null, subscriptionPriceOverride: null })
    .where(eq(stores.id, store.id));
  return true;
}

async function handleSubscriptionCreate(event) {
  const store = await findStoreForSubscriptionEvent(event);
  if (!store) return;

  await consumeIntroDiscount(store);

  const nextPaymentDate = event.data?.next_payment_date || event.data?.subscription?.next_payment_date;
  await db
    .update(stores)
    .set({
      plan: "plus",
      planCancelled: false,
      paystackSubscriptionCode: event.data?.subscription_code || event.data?.subscription?.subscription_code,
      paystackSubscriptionToken: event.data?.email_token || event.data?.subscription?.email_token,
      paystackCustomerCode: event.data?.customer?.customer_code,
      ...(nextPaymentDate ? { planRenewsAt: new Date(nextPaymentDate) } : {}),
    })
    .where(eq(stores.id, store.id));
}

async function handleSubscriptionDisable(event) {
  const code = event.data?.subscription_code;
  if (!code) return;
  await db.update(stores).set({ planCancelled: true }).where(eq(stores.paystackSubscriptionCode, code));
}

function orderNumberFromPaymentReference(reference) {
  return reference?.match(/^STOREZN-(ORD-[0-9A-Z]+)(?:-[0-9A-Z]+)?$/)?.[1] || null;
}

async function failPendingOrderAndReleaseStock(order) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  await db.transaction(async (tx) => {
    const failed = await tx
      .update(orders)
      .set({ paymentStatus: "failed", status: "abandoned", updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending")))
      .returning({ id: orders.id });
    if (failed.length === 0 || !order.branchId) return;

    await restockItems(
      tx,
      items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, branchId: order.branchId })),
    );
  });
}

// This is registered directly on Paystack only in local/single-product
// dev. In production, website-ozmictech's shared webhook router receives
// every Paystack event for the shared account (Paystack allows exactly
// one webhook URL per account) and forwards ones with a "STOREZN-"
// reference prefix here untouched, see
// website-ozmictech/lib/paystack.js. Either way this endpoint re-verifies
// the signature itself and never trusts a forward on its own.
//
// The source of truth for "did this order actually get paid" - never the
// client-side redirect back to redirectUrl, which a user can hit without
// having paid. Verifies both the webhook signature AND re-checks the
// transaction status directly with Paystack before trusting it.
async function handlePost(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Signature already passed, so this is effectively unreachable - but a
    // thrown SyntaxError here would be a 500, which Paystack retries
    // forever. A 400 is terminal.
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
  if (event.event === "subscription.create") {
    await handleSubscriptionCreate(event);
    return NextResponse.json({ received: true });
  }
  if (event.event === "invoice.create") {
    const store = await findStoreForSubscriptionEvent(event);
    if (store) await consumeIntroDiscount(store);
    return NextResponse.json({ received: true });
  }
  if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    await handleSubscriptionDisable(event);
    return NextResponse.json({ received: true });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const paymentReference = event.data?.reference;
  if (!paymentReference) return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });

  if (paymentReference.startsWith("STOREZNSUB-")) {
    await handleSubscriptionCharge(event);
    return NextResponse.json({ received: true });
  }

  const [invoicePayment] = await db.select({ id: invoicePayments.id }).from(invoicePayments).where(eq(invoicePayments.paymentReference, paymentReference)).limit(1);
  if (invoicePayment) {
    const transaction = await verifyTransaction(paymentReference);
    if (transaction.paymentStatus !== "PAID") return NextResponse.json({ received: true });
    const result = await reconcileInvoicePayment({ reference: paymentReference, paystackTransactionId: event.data?.id, amountPaid: transaction.amountPaid, paidAt: event.data?.paid_at ? new Date(event.data.paid_at) : new Date() });
    if (result.amountMismatch) {
      await logAppError(new Error("Paystack amount mismatch for invoice payment"), { req, source: "paystack.invoice_amount_mismatch", level: "warn", metadata: { paymentReference, amountPaid: transaction.amountPaid } });
    }
    if (result.invalidInvoiceState) {
      await logAppError(new Error("Paystack payment received for a non-payable invoice"), { req, source: "paystack.invoice_invalid_state", level: "error", metadata: { paymentReference, invoiceId: result.invoiceId, amountPaid: transaction.amountPaid } });
    }
    if (result.applied) {
      after(() => sendInvoicePaymentNotifications(result));
    }
    return NextResponse.json({ received: true });
  }

  // A renewal charge - Paystack initiates these itself off the
  // subscription, so it never carries our "STOREZNSUB-" prefix, but does
  // carry `data.plan` (only present for plan/subscription-linked
  // charges, never a regular storefront order).
  if (event.data?.plan && event.data?.subscription_code) {
    await handleSubscriptionRenewal(event);
    return NextResponse.json({ received: true });
  }

  const attempt = await findCheckoutAttemptByReference(paymentReference);
  if (attempt) {
    if (attempt.paymentStatus === "paid" && attempt.orderId) return NextResponse.json({ received: true });

    const transaction = await verifyTransaction(paymentReference);
    if (transaction.paymentStatus !== "PAID") {
      await failCheckoutAttemptAndReleaseStock(attempt);
      return NextResponse.json({ received: true });
    }
    if (transaction.amountPaid < attempt.totalAmount - 0.5) {
      console.error(`Paystack webhook: amount mismatch on ${paymentReference} - paid ${transaction.amountPaid}, expected ${attempt.totalAmount}`);
      await logAppError(new Error("Paystack amount mismatch for checkout attempt"), {
        req,
        source: "paystack.amount_mismatch",
        level: "warn",
        storeId: attempt.storeId,
        metadata: { paymentReference, amountPaid: transaction.amountPaid, expectedAmount: attempt.totalAmount, checkoutAttemptId: attempt.id },
      });
      await failCheckoutAttemptAndReleaseStock(attempt);
      return NextResponse.json({ received: true });
    }

    const finalized = await finalizePaidCheckoutAttempt({
      attempt,
      paymentReference,
      paidAt: event.data?.paid_at ? new Date(event.data.paid_at) : new Date(),
      recoverReleasedStock: true,
    });
    if (!finalized?.created || !finalized.order) return NextResponse.json({ received: true });

    const order = finalized.order;
    const items = finalized.items;
    const [store] = await db
      .select({ name: stores.name, ownerId: stores.ownerId, logoUrl: stores.logoUrl, storefrontAccentColor: stores.storefrontAccentColor, slug: stores.slug, customDomain: stores.customDomain, domainStatus: stores.domainStatus })
      .from(stores)
      .where(eq(stores.id, order.storeId))
      .limit(1);

    if (store?.ownerId) {
      sendPushToStore(order.storeId, {
        title: "New order",
        body: `Order ${order.orderNumber} for ${formatCurrency(order.totalAmount)} just came in.`,
        url: "/vendor/orders",
      }).catch((err) => console.error("sendPushToStore failed (new order):", err));
      if (finalized.oversold) {
        sendPushToStore(order.storeId, {
          title: "Stock issue on a paid order",
          body: `Order ${order.orderNumber} was paid after its reservation expired, but its stock is no longer available - check it before fulfilling.`,
          url: "/vendor/orders",
        }).catch((err) => console.error("sendPushToStore failed (recovered attempt oversold):", err));
      }
    }

    if (finalized.oversold) {
      await logAppError(new Error("Paid checkout attempt recovered without enough stock"), {
        req,
        source: "paystack.recovered_attempt_oversold",
        level: "warn",
        storeId: order.storeId,
        metadata: { orderId: order.id, orderNumber: order.orderNumber, paymentReference, checkoutAttemptId: attempt.id },
      });
    }

    let recipient = { email: order.guestEmail, notify: true };
    if (order.userId) {
      const [customer] = await db
        .select({ email: customers.email, notify: customers.emailNotificationsEnabled })
        .from(customers)
        .where(eq(customers.id, order.userId))
        .limit(1);
      if (customer) recipient = { email: customer.email, notify: customer.notify };
    }

    if (recipient.email && recipient.notify) {
      await sendMail({
        to: recipient.email,
        subject: `Order confirmation - ${order.orderNumber}`,
        html: orderConfirmationHtml({ order, items, store, recipientEmail: recipient.email }),
        fromName: store?.name,
        brand: store,
        preheader: `Order ${order.orderNumber} has been received`,
      }).catch((err) => console.error("sendMail failed (order confirmation):", err));
    }

    return NextResponse.json({ received: true });
  }

  let [order] = await db.select().from(orders).where(eq(orders.paymentReference, paymentReference)).limit(1);
  if (!order) {
    const orderNumber = orderNumberFromPaymentReference(paymentReference);
    if (orderNumber) {
      [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    }
  }
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.paymentStatus === "paid") return NextResponse.json({ received: true });

  // A "failed" order (not just "pending") means the 1-hour stale sweep
  // (lib/failStaleTransactions.js) already ran and released its stock
  // reservation back to the pool - a late-arriving webhook for that same
  // order can't just flip it back to paid without re-reserving, or the
  // unit it already gave up could be sold twice.
  const wasAlreadyReleased = order.paymentStatus === "failed";

  const transaction = await verifyTransaction(paymentReference);
  if (transaction.paymentStatus !== "PAID") {
    // Marking "failed" (not left "pending") also frees uq_orders_cart_
    // pending (lib/db/schema.js), so the same cart can be checked out
    // again right away instead of being stuck behind this dead order.
    await failPendingOrderAndReleaseStock(order);
    return NextResponse.json({ received: true });
  }

  // Defense in depth: Paystack fixes the amount at transaction/initialize
  // time, so this should never actually mismatch in normal operation, but
  // this endpoint is reachable directly (see the comment above this
  // route), not exclusively through the trusted forwarder - never trust
  // "PAID" alone without also confirming the paid amount actually covers
  // what the order is for. A small epsilon absorbs kobo-level float
  // rounding, not a real underpayment.
  if (transaction.amountPaid < order.totalAmount - 0.5) {
    console.error(`Paystack webhook: amount mismatch on ${paymentReference} - paid ${transaction.amountPaid}, expected ${order.totalAmount}`);
    await logAppError(new Error("Paystack amount mismatch for legacy order"), {
      req,
      source: "paystack.amount_mismatch",
      level: "warn",
      storeId: order.storeId,
      metadata: { paymentReference, amountPaid: transaction.amountPaid, expectedAmount: order.totalAmount, orderId: order.id },
    });
    await failPendingOrderAndReleaseStock(order);
    return NextResponse.json({ received: true });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const lowStockNow = [];
  let oversold = false;
  let wonClaim = false;

  await db.transaction(async (tx) => {
    // The status flip is the idempotency claim, done atomically: this
    // endpoint is reachable both directly and via the shared forwarder,
    // and Paystack retries on any non-2xx, so two deliveries for the same
    // charge can race here. Only the one whose UPDATE actually matches a
    // not-yet-paid row proceeds; the loser matches zero rows and bails
    // before re-reserving stock, re-sending the confirmation email, or
    // firing a second "new order" push.
    const claimed = await tx
      .update(orders)
      .set({ paymentReference, paymentStatus: "paid", status: "processing", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, "paid")))
      .returning({ id: orders.id });
    if (claimed.length === 0) return;
    wonClaim = true;

    if (wasAlreadyReleased && order.branchId) {
      try {
        await reserveStock(
          tx,
          items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, productName: i.productName, branchId: order.branchId })),
        );
      } catch (err) {
        if (err instanceof OutOfStockError) {
          // The buyer genuinely paid - that can't be undone from inside a
          // webhook handler - so the order still gets marked paid below,
          // just flagged for the vendor to sort out manually (refund, or
          // source more stock) instead of silently shipping against
          // stock that no longer exists.
          oversold = true;
        } else {
          throw err;
        }
      }
    }

    // Stock is no longer decremented here for the normal path - checkout
    // already reserved it atomically at order-creation time (see
    // reserveStock in lib/inventory.js, called from checkout/route.js),
    // so decrementing again on payment confirmation would double-count.
    // (The wasAlreadyReleased branch above is the one exception, where
    // that original reservation was already released and has to be
    // redone here instead.) This just reads the current (already-
    // decremented) stock at the branch this order was fulfilled from to
    // detect crossing under LOW_STOCK_THRESHOLD for the push notification
    // below - "before" is reconstructed as current + this item's own
    // quantity, same math as when this used to read it off the
    // decrement's own return value. Per-branch (not the storewide
    // aggregate) is what's actually actionable for a vendor running more
    // than one location.
    let branchName = null;
    if (order.branchId) {
      const [branch] = await tx.select({ name: branches.name }).from(branches).where(eq(branches.id, order.branchId)).limit(1);
      branchName = branch?.name || null;
    }
    for (const item of items) {
      const condition = item.variantId
        ? and(eq(productBranchStock.variantId, item.variantId), eq(productBranchStock.branchId, order.branchId))
        : and(eq(productBranchStock.productId, item.productId), isNull(productBranchStock.variantId), eq(productBranchStock.branchId, order.branchId));
      const [row] = order.branchId ? await tx.select({ stock: productBranchStock.stock }).from(productBranchStock).where(condition).limit(1) : [];
      if (row?.stock != null) {
        const before = row.stock + item.quantity;
        if (before > LOW_STOCK_THRESHOLD && row.stock <= LOW_STOCK_THRESHOLD) {
          lowStockNow.push({ name: item.productName, variantLabel: item.variantLabel, stock: row.stock, branchName });
        }
      }
    }

    // Cleared/converted by cartId, set at checkout time (see
    // checkout/route.js), not re-resolved by userId - that previously
    // only worked for logged-in users, so a guest could pay, then revisit
    // and re-checkout the exact same still-"active" cart for a real
    // duplicate order. cartId is set for every online order regardless of
    // guest/logged-in, so this now covers both.
    if (order.cartId) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, order.cartId));
      await tx.update(carts).set({ status: "converted", updatedAt: new Date() }).where(eq(carts.id, order.cartId));
    }
  });

  // A concurrent delivery already fully processed this order - don't send
  // a duplicate confirmation email or a second "new order" push.
  if (!wonClaim) return NextResponse.json({ received: true });

  if (oversold) {
    console.error(`Paystack webhook: order ${order.orderNumber} confirmed paid but could not re-reserve stock - needs manual attention`);
    await logAppError(new Error("Paid order could not re-reserve stock"), {
      req,
      source: "paystack.oversold_paid_order",
      level: "warn",
      storeId: order.storeId,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, paymentReference },
    });
    sendPushToStore(order.storeId, {
      title: "Stock issue on a paid order",
      body: `Order ${order.orderNumber} was confirmed paid, but its stock is no longer available - check it before fulfilling.`,
      url: "/vendor/orders",
    }).catch((err) => console.error("sendPushToStore failed (oversold order):", err));
  }

  let recipient = { email: order.guestEmail, notify: true };
  if (order.userId) {
    // orders.userId is a customers.id (see lib/db/schema.js) - customer
    // accounts moved out of `users` when staff/customer got split into
    // their own tables.
    const [customer] = await db
      .select({ email: customers.email, notify: customers.emailNotificationsEnabled })
      .from(customers)
      .where(eq(customers.id, order.userId))
      .limit(1);
    if (customer) recipient = { email: customer.email, notify: customer.notify };
  }

  const [store] = await db
    .select({ name: stores.name, ownerId: stores.ownerId, logoUrl: stores.logoUrl, storefrontAccentColor: stores.storefrontAccentColor, slug: stores.slug, customDomain: stores.customDomain, domainStatus: stores.domainStatus })
    .from(stores)
    .where(eq(stores.id, order.storeId))
    .limit(1);

  if (store?.ownerId) {
    // Operational, not owner-only - staff can act on both of these
    // (see canManageStore vs isStoreOwner in lib/auth.js), so the whole
    // store team gets notified, not just the vendor.
    sendPushToStore(order.storeId, {
      title: "New order",
      body: `Order ${order.orderNumber} for ${formatCurrency(order.totalAmount)} just came in.`,
      url: "/vendor/orders",
    }).catch((err) => console.error("sendPushToStore failed (new order):", err));

    for (const p of lowStockNow) {
      sendPushToStore(order.storeId, {
        title: "Low stock",
        body: `${p.name}${p.variantLabel ? ` (${p.variantLabel})` : ""}${p.branchName ? ` at ${p.branchName}` : ""} is down to ${p.stock} left.`,
        url: "/vendor/products",
      }).catch((err) => console.error("sendPushToStore failed (low stock):", err));
    }
  }

  if (recipient.email && recipient.notify) {
    after(() => sendMail({
      to: recipient.email,
      subject: `Order confirmation - ${order.orderNumber}`,
      html: orderConfirmationHtml({ order, items, store, recipientEmail: recipient.email }),
      fromName: store?.name,
      brand: store,
      preheader: `Order ${order.orderNumber} has been received`,
    }).catch((err) => console.error("sendMail failed (order confirmation):", err)));
  }

  return NextResponse.json({ received: true });
  } catch (err) {
    await logAppError(err, {
      req,
      source: "paystack.webhook",
      metadata: { event: event?.event || null, reference: event?.data?.reference || null },
    });
    throw err;
  }
}

export const POST = withApiMonitoring(handlePost, { source: "paystack.webhook" });
