import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import {
  addresses,
  branches,
  cartItems,
  carts,
  categories,
  customers,
  orderItems,
  orders,
  productBranchStock,
  productVariants,
  products,
  pushSubscriptions,
  refundRequests,
  reviews,
  shippingRates,
  staff,
  storeSubscriptionTransactions,
  storeUploads,
  stores,
  tokens,
  users,
} from "../../../../../lib/db/schema.js";
import { eq, inArray, or } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { deletePublicFile, isOwnedUploadUrl } from "../../../../../lib/storage/index.js";

// Permanent, irreversible: wipes the vendor's own row plus every store
// they own and everything that hangs off it - products (and their
// images/video from storage), categories, branches, shipping rates,
// staff, the store's own shopper accounts, carts, orders, reviews,
// refund requests, subscription history. There is no soft-delete or
// recovery. The vendor's Paystack sub-account is left untouched (it's
// their own bank link at Paystack, not ours to remove).
//
// Ordering matters - no FK is ON DELETE CASCADE, so children go before
// parents. delMany() no-ops on an empty id list (drizzle's inArray()
// with [] generates invalid SQL).
async function delMany(tx, table, column, ids) {
  if (ids.length > 0) await tx.delete(table).where(inArray(column, ids));
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "vendor") {
    return NextResponse.json({ error: "Only a store owner can delete the account from here" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect" }, { status: 403 });
  }

  const ownedStores = await db.select().from(stores).where(eq(stores.ownerId, user.id));
  const storeIds = ownedStores.map((s) => s.id);

  // Collect every storage URL to purge after the DB delete commits.
  const storageUrls = [];
  for (const s of ownedStores) {
    if (s.logoUrl) storageUrls.push(s.logoUrl);
    if (s.faviconUrl) storageUrls.push(s.faviconUrl);
  }
  const ownedProducts = storeIds.length
    ? await db
        .select({ id: products.id, storeId: products.storeId, images: products.images, videoUrl: products.videoUrl })
        .from(products)
        .where(inArray(products.storeId, storeIds))
    : [];
  for (const p of ownedProducts) {
    for (const url of p.images || []) storageUrls.push(url);
    if (p.videoUrl) storageUrls.push(p.videoUrl);
  }

  await db.transaction(async (tx) => {
    for (const store of ownedStores) {
      const sid = store.id;
      const productIds = ownedProducts.filter((p) => p.storeId === sid).map((p) => p.id);
      const orderRows = await tx.select({ id: orders.id }).from(orders).where(eq(orders.storeId, sid));
      const orderIds = orderRows.map((o) => o.id);
      const cartRows = await tx.select({ id: carts.id }).from(carts).where(eq(carts.storeId, sid));
      const cartIds = cartRows.map((c) => c.id);
      const staffRows = await tx.select({ id: staff.id }).from(staff).where(eq(staff.storeId, sid));
      const staffIds = staffRows.map((r) => r.id);
      const customerRows = await tx.select({ id: customers.id }).from(customers).where(eq(customers.storeId, sid));
      const customerIds = customerRows.map((c) => c.id);

      await delMany(tx, reviews, reviews.productId, productIds);
      await delMany(tx, refundRequests, refundRequests.orderId, orderIds);
      await delMany(tx, orderItems, orderItems.orderId, orderIds);
      await tx.delete(orders).where(eq(orders.storeId, sid));
      await delMany(tx, cartItems, cartItems.cartId, cartIds);
      await tx.delete(carts).where(eq(carts.storeId, sid));
      await delMany(tx, productBranchStock, productBranchStock.productId, productIds);
      await delMany(tx, productVariants, productVariants.productId, productIds);
      await tx.delete(products).where(eq(products.storeId, sid));
      await tx.delete(categories).where(eq(categories.storeId, sid));
      await tx.delete(shippingRates).where(eq(shippingRates.storeId, sid));

      if (staffIds.length || customerIds.length) {
        const conds = [];
        if (staffIds.length) conds.push(inArray(tokens.staffId, staffIds));
        if (customerIds.length) conds.push(inArray(tokens.customerId, customerIds));
        await tx.delete(tokens).where(conds.length > 1 ? or(...conds) : conds[0]);
      }
      await delMany(tx, pushSubscriptions, pushSubscriptions.customerId, customerIds);
      await delMany(tx, addresses, addresses.userId, customerIds);
      await tx.delete(staff).where(eq(staff.storeId, sid));
      await tx.delete(branches).where(eq(branches.storeId, sid));
      await tx.delete(storeSubscriptionTransactions).where(eq(storeSubscriptionTransactions.storeId, sid));
      await tx.delete(storeUploads).where(eq(storeUploads.storeId, sid));
      await tx.delete(customers).where(eq(customers.storeId, sid));
      await tx.delete(stores).where(eq(stores.id, sid));
    }

    await tx.delete(tokens).where(eq(tokens.userId, user.id));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    await tx.delete(users).where(eq(users.id, user.id));
  });

  // Best-effort, after the commit - a storage hiccup must not undo (or
  // block the response for) a delete that already went through.
  Promise.all(
    [...new Set(storageUrls)]
      .filter((url) => isOwnedUploadUrl(url))
      .map((url) => deletePublicFile(url).catch(() => {})),
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
