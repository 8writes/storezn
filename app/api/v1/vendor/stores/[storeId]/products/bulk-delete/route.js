import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { stores } from "../../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { deleteStoreProducts, purgeProductAssets } from "../../../../../../../../lib/productDelete.js";
import { logStoreActivity } from "../../../../../../../../lib/storeActivity.js";

const MAX_IDS = 100;

// Hard-delete several products at once. POST (not DELETE) so the id list
// rides in a normal JSON body - some infra strips bodies off DELETE.
// Products that have ever been on an order can't be removed (order
// history) and come back under `blocked`; everything else is cleared,
// with its images/video/review photos torn down via after().
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productIds = Array.isArray(body?.productIds) ? body.productIds : null;
  if (!productIds || productIds.length === 0) {
    return NextResponse.json({ error: "No products selected" }, { status: 400 });
  }
  if (productIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Delete up to ${MAX_IDS} products at a time` }, { status: 400 });
  }

  const { deleted, blocked, assetUrls } = await deleteStoreProducts({ storeId, productIds });

  if (assetUrls.length > 0) after(() => purgeProductAssets(assetUrls));
  if (deleted.length > 0) {
    after(() =>
      logStoreActivity({
        storeId,
        actor: user,
        action: "product.delete",
        summary: `Bulk-deleted ${deleted.length} product${deleted.length === 1 ? "" : "s"}`,
        targetType: "product",
        metadata: { count: deleted.length, blocked: blocked.length },
      }),
    );
  }

  return NextResponse.json({ deleted: deleted.length, blocked });
}
