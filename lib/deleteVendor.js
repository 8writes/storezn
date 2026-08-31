import { db } from "./db/index.js";
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
} from "./db/schema.js";
import { eq, inArray, or } from "drizzle-orm";
import { deletePublicFile, isOwnedUploadUrl } from "./storage/index.js";

// delMany() no-ops on an empty id list - drizzle's inArray() with []
// generates invalid SQL.
async function delMany(tx, table, column, ids) {
  if (ids.length > 0) await tx.delete(table).where(inArray(column, ids));
}

// Permanent, irreversible cascade: removes a vendor's user row plus every
// store they own and everything under it - products (and their
// images/video from storage), variants, branch stock, categories,
// branches, shipping rates, staff, the store's own shopper accounts and
// their addresses/push-subs/tokens, carts, orders + items, reviews,
// refund requests, subscription history, storage-ledger rows, and
// reset/verification tokens. No soft-delete, no recovery. The vendor's
// Paystack sub-account is left untouched (it's their own bank link at
// Paystack, not ours). Ordering matters - no FK is ON DELETE CASCADE, so
// children go before parents. Storage files are purged best-effort after
// the DB transaction commits.
export async function deleteVendorAccount(userId) {
  const ownedStores = await db.select().from(stores).where(eq(stores.ownerId, userId));
  const storeIds = ownedStores.map((s) => s.id);

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
      const orderIds = (await tx.select({ id: orders.id }).from(orders).where(eq(orders.storeId, sid))).map((o) => o.id);
      const cartIds = (await tx.select({ id: carts.id }).from(carts).where(eq(carts.storeId, sid))).map((c) => c.id);
      const staffIds = (await tx.select({ id: staff.id }).from(staff).where(eq(staff.storeId, sid))).map((r) => r.id);
      const customerIds = (await tx.select({ id: customers.id }).from(customers).where(eq(customers.storeId, sid))).map((c) => c.id);

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

      const tokenConds = [];
      if (staffIds.length) tokenConds.push(inArray(tokens.staffId, staffIds));
      if (customerIds.length) tokenConds.push(inArray(tokens.customerId, customerIds));
      if (tokenConds.length) await tx.delete(tokens).where(tokenConds.length > 1 ? or(...tokenConds) : tokenConds[0]);

      await delMany(tx, pushSubscriptions, pushSubscriptions.customerId, customerIds);
      await delMany(tx, addresses, addresses.userId, customerIds);
      await tx.delete(staff).where(eq(staff.storeId, sid));
      await tx.delete(branches).where(eq(branches.storeId, sid));
      await tx.delete(storeSubscriptionTransactions).where(eq(storeSubscriptionTransactions.storeId, sid));
      await tx.delete(storeUploads).where(eq(storeUploads.storeId, sid));
      await tx.delete(customers).where(eq(customers.storeId, sid));
      await tx.delete(stores).where(eq(stores.id, sid));
    }

    await tx.delete(tokens).where(eq(tokens.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  Promise.all(
    [...new Set(storageUrls)].filter((url) => isOwnedUploadUrl(url)).map((url) => deletePublicFile(url).catch(() => {})),
  ).catch(() => {});
}
