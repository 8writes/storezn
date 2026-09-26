import { db } from "./db/index.js";
import {
  addresses,
  branches,
  cartItems,
  carts,
  cashMovements,
  categories,
  checkoutAttempts,
  customers,
  invoiceInventoryHolds,
  invoiceItems,
  invoicePayments,
  invoiceRequestItems,
  invoiceRequests,
  invoices,
  orderItems,
  orderTenders,
  orders,
  posHeldSales,
  posRegisters,
  posSessions,
  productBranchStock,
  productVariants,
  products,
  pushSubscriptions,
  refundRequests,
  reviews,
  shippingRates,
  staff,
  storeActivityLogs,
  storeSubscriptionTransactions,
  storeUploads,
  stores,
  tokens,
  users,
  vendorProductFormPreferences,
} from "./db/schema.js";
import { eq, inArray, or } from "drizzle-orm";
import { deletePublicFile } from "./storage/index.js";

// delMany() no-ops on an empty id list - drizzle's inArray() with []
// generates invalid SQL.
async function delMany(tx, table, column, ids) {
  if (ids.length > 0) await tx.delete(table).where(inArray(column, ids));
}

// Permanent, irreversible cascade: removes a vendor's user row plus every
// store they own and everything under it - products (and their
// images/video from storage), variants, branch stock, categories,
// branches, shipping rates, staff, the store's own shopper accounts and
// their addresses/push-subs/tokens, carts, checkout attempts, orders +
// items + tenders, the POS ledger (registers, shifts, drawer movements,
// held sales), invoices + their items/holds/payments and quote requests,
// reviews, refund requests, the store audit log, subscription history,
// storage-ledger rows, and reset/verification tokens. No soft-delete, no
// recovery. The vendor's Paystack sub-account is left untouched (it's
// their own bank link at Paystack, not ours).
//
// Ordering matters - NO FK here is ON DELETE CASCADE, so every child has
// to go before its parent or the whole transaction aborts on a foreign
// key violation. When adding a table to lib/db/schema.js that references
// stores/orders/carts/branches/products/customers, it must be added here
// too; tests/deleteVendor.test.mjs asserts that every such table is
// covered so this list cannot silently fall behind again.
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
      const registerIds = (await tx.select({ id: posRegisters.id }).from(posRegisters).where(eq(posRegisters.storeId, sid))).map((r) => r.id);
      const sessionIds = registerIds.length
        ? (await tx.select({ id: posSessions.id }).from(posSessions).where(inArray(posSessions.registerId, registerIds))).map((s) => s.id)
        : [];
      const invoiceIds = (await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.storeId, sid))).map((i) => i.id);
      const requestIds = (await tx.select({ id: invoiceRequests.id }).from(invoiceRequests).where(eq(invoiceRequests.storeId, sid))).map((r) => r.id);

      // POS ledger first - cash movements and tenders both point at
      // orders, so they have to clear before the orders delete below.
      // Tenders go by orderId rather than sessionId: a "manual" recorded
      // sale writes a tender with no session at all.
      await delMany(tx, cashMovements, cashMovements.sessionId, sessionIds);
      await delMany(tx, orderTenders, orderTenders.orderId, orderIds);
      await delMany(tx, posHeldSales, posHeldSales.sessionId, sessionIds);
      await delMany(tx, posSessions, posSessions.registerId, registerIds);
      await tx.delete(posRegisters).where(eq(posRegisters.storeId, sid));

      // Invoicing chain - payments/items/holds hang off invoices, and
      // invoices themselves point at orders and at the vendor's own user
      // row (invoices.createdBy), so they must clear before both.
      await delMany(tx, invoicePayments, invoicePayments.invoiceId, invoiceIds);
      await delMany(tx, invoiceItems, invoiceItems.invoiceId, invoiceIds);
      await delMany(tx, invoiceInventoryHolds, invoiceInventoryHolds.invoiceId, invoiceIds);
      await tx.delete(invoices).where(eq(invoices.storeId, sid));
      await delMany(tx, invoiceRequestItems, invoiceRequestItems.requestId, requestIds);
      await tx.delete(invoiceRequests).where(eq(invoiceRequests.storeId, sid));

      // Priced-but-unpaid checkout sessions - reference orders, carts,
      // branches and customers, so they clear before all four.
      await tx.delete(checkoutAttempts).where(eq(checkoutAttempts.storeId, sid));

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
      await tx.delete(storeActivityLogs).where(eq(storeActivityLogs.storeId, sid));
      await tx.delete(vendorProductFormPreferences).where(eq(vendorProductFormPreferences.storeId, sid));

      const tokenConds = [];
      if (staffIds.length) tokenConds.push(inArray(tokens.staffId, staffIds));
      if (customerIds.length) tokenConds.push(inArray(tokens.customerId, customerIds));
      if (tokenConds.length) await tx.delete(tokens).where(tokenConds.length > 1 ? or(...tokenConds) : tokenConds[0]);

      await delMany(tx, pushSubscriptions, pushSubscriptions.customerId, customerIds);
      await delMany(tx, addresses, addresses.userId, customerIds);
      await tx.delete(staff).where(eq(staff.storeId, sid));

      // A customer/staff row that predates the users/staff/customers
      // split can still be sitting in `users` pointing at this store (see
      // the legacy fallback in lib/auth.js's getUser). Those are other
      // people's account rows, not this vendor's, so they're detached
      // rather than deleted - but the references have to go or branches/
      // stores below can't be removed. A detached legacy row can no
      // longer authenticate against a store, which is the intended
      // outcome of deleting that store anyway.
      await tx.update(users).set({ branchId: null }).where(eq(users.storeId, sid));
      await tx.delete(branches).where(eq(branches.storeId, sid));
      await tx.update(users).set({ storeId: null }).where(eq(users.storeId, sid));

      await tx.delete(storeSubscriptionTransactions).where(eq(storeSubscriptionTransactions.storeId, sid));
      await tx.delete(storeUploads).where(eq(storeUploads.storeId, sid));
      await tx.delete(customers).where(eq(customers.storeId, sid));
      await tx.delete(stores).where(eq(stores.id, sid));
    }

    await tx.delete(tokens).where(eq(tokens.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  // Every URL here came off a stores/products row this vendor owned, which
  // is the ownership proof - isOwnedUploadUrl() is for the case where only
  // a URL is known (see DELETE /api/v1/uploads/file) and, called without a
  // user id, it matched nothing and silently skipped every file.
  await Promise.all(
    [...new Set(storageUrls)].map((url) => deletePublicFile(url).catch(() => {})),
  ).catch(() => {});
}
