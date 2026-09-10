import { db } from "./db/index.js";
import { products, productVariants, productBranchStock, cartItems, reviews, orderItems } from "./db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { deletePublicFile } from "./storage/index.js";
import { removeStoreUpload } from "./storeUploads.js";

// Shared hard-delete used by both the single product DELETE route and the
// bulk-delete route, so the two can't drift apart on what gets cleaned up.
//
// A product that's ever appeared on an order can't be hard-deleted -
// orderItems snapshots its name/image/price at purchase time but still
// FKs back to this row, and order history is sacred. Those ids come back
// under `blocked` (with the name, for the UI) and are left untouched.
//
// Everything else with a FK to products (variants, per-branch stock, cart
// items, reviews) is cleared in the same transaction as the product rows.
// The image/video/review-photo URLs those rows referenced are returned as
// `assetUrls` rather than deleted here - the caller passes them to
// after() so the storage teardown still runs once the response is sent
// (an un-awaited promise would be cut off when the function returns).
export async function deleteStoreProducts({ storeId, productIds }) {
  const ids = [...new Set((productIds || []).filter((v) => typeof v === "string" && v))];
  if (ids.length === 0) return { deleted: [], blocked: [], assetUrls: [] };

  const rows = await db
    .select({ id: products.id, name: products.name, images: products.images, videoUrl: products.videoUrl })
    .from(products)
    .where(and(eq(products.storeId, storeId), inArray(products.id, ids)));
  if (rows.length === 0) return { deleted: [], blocked: [], assetUrls: [] };

  const foundIds = rows.map((r) => r.id);
  const orderedRows = await db
    .select({ productId: orderItems.productId })
    .from(orderItems)
    .where(inArray(orderItems.productId, foundIds));
  const orderedSet = new Set(orderedRows.map((r) => r.productId));

  const deletableRows = rows.filter((r) => !orderedSet.has(r.id));
  const blocked = rows.filter((r) => orderedSet.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
  const deletableIds = deletableRows.map((r) => r.id);
  if (deletableIds.length === 0) return { deleted: [], blocked, assetUrls: [] };

  // Grab review photos before the review rows are gone, so their files
  // can be torn down alongside the product's own images.
  const reviewImgRows = await db
    .select({ imageUrl: reviews.imageUrl })
    .from(reviews)
    .where(inArray(reviews.productId, deletableIds));

  await db.transaction(async (tx) => {
    // cart_items rows carry productId whether or not they point at a
    // variant, so this clears both. Same for product_branch_stock.
    await tx.delete(cartItems).where(inArray(cartItems.productId, deletableIds));
    await tx.delete(reviews).where(inArray(reviews.productId, deletableIds));
    await tx.delete(productBranchStock).where(inArray(productBranchStock.productId, deletableIds));
    await tx.delete(productVariants).where(inArray(productVariants.productId, deletableIds));
    await tx.delete(products).where(inArray(products.id, deletableIds));
  });

  const assetUrls = [
    ...deletableRows.flatMap((r) => (Array.isArray(r.images) ? r.images : [])),
    ...deletableRows.map((r) => r.videoUrl),
    ...reviewImgRows.map((r) => r.imageUrl),
  ].filter((u) => typeof u === "string" && u);

  return { deleted: deletableIds, blocked, assetUrls };
}

// Best-effort teardown of the storage objects a product delete orphaned -
// the Cloudinary/S3 object and its metered-usage row. Each runs
// independently (allSettled) so one failure doesn't strand the rest.
// Meant to be handed to after() by the route.
export async function purgeProductAssets(assetUrls) {
  const urls = [...new Set((assetUrls || []).filter((u) => typeof u === "string" && u))];
  if (urls.length === 0) return;
  await Promise.allSettled(
    urls.map((url) => Promise.allSettled([deletePublicFile(url), removeStoreUpload(url)])),
  );
}
