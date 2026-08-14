import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { orders, orderItems, products, productVariants, stores } from "../../../../../../../../lib/db/schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, createOfflineOrderSchema } from "../../../../../../../../lib/validate.js";
import { generateOrderNumber, computeOrderTotals } from "../../../../../../../../lib/orders.js";
import { sendMail } from "../../../../../../../../lib/email/sendMail.js";
import { formatCurrency } from "../../../../../../../../lib/format.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

// Lets a vendor record a sale that happened outside the storefront
// (in-person, phone, cash on delivery) so it shows up in their order
// history and stock alongside real checkouts - no Paystack transaction is
// created, the order is inserted straight into "paid"/"processing" since
// the vendor is telling us the money already changed hands.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createOfflineOrderSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { buyerName, buyerEmail, buyerPhone, note, items } = result.data;

  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))];

  const [productRows, variantRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, productIds))),
    variantIds.length > 0 ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [],
  ]);
  const productById = new Map(productRows.map((p) => [p.id, p]));
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const resolvedItems = [];
  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) return NextResponse.json({ error: "One or more products were not found in this store" }, { status: 404 });
    const variant = item.variantId ? variantById.get(item.variantId) : null;
    if (item.variantId && (!variant || variant.productId !== product.id)) {
      return NextResponse.json({ error: `${product.name}: selected option not found` }, { status: 404 });
    }

    const stock = variant ? variant.stock : product.stock;
    if (product.productType === "physical" && stock != null && stock < item.quantity) {
      return NextResponse.json({ error: `Not enough stock for ${product.name}` }, { status: 409 });
    }

    const unitPrice = variant?.price ?? product.price;
    resolvedItems.push({
      product,
      variant,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    });
  }

  const subtotal = resolvedItems.reduce((sum, i) => sum + i.lineTotal, 0);
  // The vendor already collected exactly the item price in person - there's
  // no "add a fee on top" moment for a cash/offline sale the way there is
  // at online checkout, so this always uses the vendor-absorbs math
  // (totalAmount = subtotal) regardless of the store's own feeChargedToCustomer setting.
  // Commission is always 0 here, unlike online checkout - nothing is
  // actually processed/split through Paystack for a sale that happened
  // in cash/in person, so the platform hasn't earned a cut of it.
  const commissionRatePercent = 0;
  const { totalAmount, commissionAmount, vendorPayoutAmount } = computeOrderTotals({
    subtotal,
    shippingFee: 0,
    commissionRatePercent,
    feeChargedToCustomer: false,
  });

  const orderNumber = generateOrderNumber();

  const order = await db.transaction(async (tx) => {
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        storeId,
        userId: null,
        orderNumber,
        guestEmail: buyerEmail || null,
        buyerName,
        buyerPhone: buyerPhone || null,
        status: "processing",
        paymentStatus: "paid",
        subtotal,
        shippingFee: 0,
        totalAmount,
        commissionRatePercent,
        commissionAmount,
        vendorPayoutAmount,
        feeChargedToCustomer: false,
        note: note || null,
        isOffline: true,
        paidAt: new Date(),
      })
      .returning();

    await tx.insert(orderItems).values(
      resolvedItems.map((i) => ({
        orderId: createdOrder.id,
        productId: i.product.id,
        variantId: i.variant?.id || null,
        productName: i.product.name,
        productImage: i.product.images?.[0] || null,
        variantLabel: i.variant ? Object.entries(i.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
    );

    for (const i of resolvedItems) {
      if (i.variant) {
        await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${i.quantity}` })
          .where(and(eq(productVariants.id, i.variant.id), sql`${productVariants.stock} is not null`));
      } else {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${i.quantity}` })
          .where(and(eq(products.id, i.product.id), sql`${products.stock} is not null`));
      }
    }

    return createdOrder;
  });

  if (buyerEmail) {
    const itemsHtml = resolvedItems
      .map((i) => `<tr><td>${i.product.name}${i.variant ? ` (${Object.values(i.variant.options).join(", ")})` : ""}</td><td>${i.quantity}</td><td>${formatCurrency(i.lineTotal)}</td></tr>`)
      .join("");
    // Wrapped in after() rather than left as a bare fire-and-forget
    // promise - see the identical comment in forgot-password/route.js.
    after(() =>
      sendMail({
        to: buyerEmail,
        subject: `Order confirmation - ${order.orderNumber}`,
        html: `<h2>Thanks for your order!</h2><p>Order <strong>${order.orderNumber}</strong> from ${store.name} has been recorded.</p><table>${itemsHtml}</table><p>Total: ${formatCurrency(order.totalAmount)}</p>`,
        fromName: store.name,
      }).catch((err) => console.error("sendMail failed (offline order confirmation):", err)),
    );
  }

  return NextResponse.json({ order }, { status: 201 });
}
