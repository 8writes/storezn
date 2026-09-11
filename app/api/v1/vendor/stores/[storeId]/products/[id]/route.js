import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { products, stores, orderItems, orders, branches } from "../../../../../../../../lib/db/schema.js";
import { and, eq, ne, sql } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, updateProductSchema } from "../../../../../../../../lib/validate.js";
import { deletePublicFile } from "../../../../../../../../lib/storage/index.js";
import { removeStoreUpload } from "../../../../../../../../lib/storeUploads.js";
import { deleteStoreProducts, purgeProductAssets } from "../../../../../../../../lib/productDelete.js";
import { setBranchStock } from "../../../../../../../../lib/inventory.js";
import { logStoreActivity } from "../../../../../../../../lib/storeActivity.js";
import { formatCurrency } from "../../../../../../../../lib/format.js";

const money = (v) => (v == null ? "N/A" : formatCurrency(v));

async function loadStoreAndProduct(storeId, productId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { store: null, product: null };
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId))).limit(1);
  return { store, product };
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const { store, product } = await loadStoreAndProduct(storeId, id);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Paid orders only, and not refunded - a refund reverses the sale, so
  // it shouldn't keep counting as "sold" (cancelled/refund_declined
  // orders were still actually paid for, so those do still count).
  const [{ unitsSold }] = await db
    .select({ unitsSold: sql`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number) })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.productId, id), eq(orders.paymentStatus, "paid"), ne(orders.status, "refunded")));

  return NextResponse.json({ product: { ...product, unitsSold } });
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const { store, product } = await loadStoreAndProduct(storeId, id);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateProductSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: "No changes to update" }, { status: 400 });
  }

  if (result.data.slug && result.data.slug !== product.slug) {
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.slug, result.data.slug)))
      .limit(1);
    if (existing) return NextResponse.json({ error: "That product slug already exists" }, { status: 409 });
  }

  // products.stock is a cached aggregate now, not the source of truth
  // (see lib/inventory.js) - a plain "Stock" field submission (today's
  // single-branch UI, or a quick edit on a multi-branch store) always
  // means the default branch specifically, routed through setBranchStock
  // so the aggregate stays in sync instead of drifting from a direct
  // write.
  const { stock, ...rest } = result.data;
  // The `date` column rejects "" - "" from the form means "clear the date".
  if (rest.expiryDate === "") rest.expiryDate = null;
  const [updated] = await db
    .update(products)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();

  if (stock !== undefined) {
    const [defaultBranch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.storeId, storeId), eq(branches.isDefault, true))).limit(1);
    if (defaultBranch) {
      await db.transaction((tx) => setBranchStock(tx, { productId: id, variantId: null, branchId: defaultBranch.id, stock }));
      const [refreshed] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, id)).limit(1);
      updated.stock = refreshed.stock;
    }
  }

  // Any image the vendor removed from the gallery (still in the old row,
  // gone from the new one) is now unreferenced - clean it out of storage
  // too, not just the DB array, best-effort so a storage hiccup doesn't
  // fail the save itself.
  if (result.data.images) {
    const removed = (product.images || []).filter((url) => !result.data.images.includes(url));
    Promise.all(removed.map((url) => Promise.all([deletePublicFile(url), removeStoreUpload(url)]))).catch(() => {});
  }
  // Same reasoning for the video - "videoUrl" in result.data means the
  // vendor either replaced or cleared it (see updateProductSchema);
  // either way the old one (if different) is now unreferenced.
  if ("videoUrl" in result.data && product.videoUrl && product.videoUrl !== result.data.videoUrl) {
    Promise.all([deletePublicFile(product.videoUrl), removeStoreUpload(product.videoUrl)]).catch(() => {});
  }

  // Audit the changes an owner cares about (price, cost, availability,
  // stock) - not every photo reorder.
  const bits = [];
  if (result.data.price != null && Number(result.data.price) !== product.price) bits.push(`price ${money(product.price)} → ${money(result.data.price)}`);
  if ("costPrice" in result.data && (result.data.costPrice ?? null) !== (product.costPrice ?? null)) bits.push(`cost ${money(product.costPrice)} → ${money(result.data.costPrice)}`);
  if (result.data.isActive != null && result.data.isActive !== product.isActive) bits.push(result.data.isActive ? "set live" : "archived");
  if (stock !== undefined && stock !== product.stock) bits.push(`stock ${product.stock ?? "∞"} → ${stock}`);
  if (bits.length) {
    after(() =>
      logStoreActivity({
        storeId,
        actor: user,
        action: "product.update",
        summary: `${product.name}: ${bits.join(", ")}`,
        targetType: "product",
        targetId: id,
        metadata: { name: product.name, changes: bits },
      }),
    );
  }

  return NextResponse.json({ product: updated });
}

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, id } = await params;
  const { store, product } = await loadStoreAndProduct(storeId, id);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // A product that's actually been ordered can't be hard-deleted - that
  // would corrupt past order history (orderItems snapshots the product
  // name/image/price at purchase time, but still points back at this
  // row). Suspend/deactivate it instead (isActive via PATCH above) so it
  // just stops being sold. deleteStoreProducts reports it under `blocked`
  // rather than deleting it; translate that back to the 409 this route
  // has always returned.
  const { deleted, blocked, assetUrls } = await deleteStoreProducts({ storeId, productIds: [id] });
  if (blocked.length > 0) {
    return NextResponse.json({ error: "This product has been ordered before and can't be deleted - deactivate it instead" }, { status: 409 });
  }
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Storage teardown after the response is sent - an un-awaited promise
  // would be cut off when the function returns, leaving orphaned files.
  if (assetUrls.length > 0) after(() => purgeProductAssets(assetUrls));

  after(() =>
    logStoreActivity({
      storeId,
      actor: user,
      action: "product.delete",
      summary: `Deleted product "${product.name}"`,
      targetType: "product",
      targetId: id,
      metadata: { name: product.name, sku: product.sku || null },
    }),
  );

  return NextResponse.json({ ok: true });
}
