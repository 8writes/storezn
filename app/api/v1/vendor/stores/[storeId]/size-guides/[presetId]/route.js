import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import { sizeGuidePresets, stores } from "../../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, updateSizeGuidePresetSchema } from "../../../../../../../../lib/validate.js";
import { isUniqueViolation } from "../../../../../../../../lib/dbErrors.js";
import { findStorePreset, syncPresetToProducts } from "../../../../../../../../lib/sizeGuidePresets.js";

async function load(req, params) {
  const user = await getUser(req);
  const { storeId, presetId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const preset = await findStorePreset(store.id, presetId);
  if (!preset) return { error: NextResponse.json({ error: "Size guide not found" }, { status: 404 }) };
  return { user, store, preset };
}

// Rename and/or change the table. A new table is copied onto every product
// using this guide, in the same transaction.
export async function PATCH(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const body = await req.json().catch(() => null);
  const result = validate(updateSizeGuidePresetSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (Object.keys(result.data).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  try {
    const { preset, productsUpdated } = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(sizeGuidePresets)
        .set({ ...result.data, updatedAt: new Date() })
        .where(eq(sizeGuidePresets.id, loaded.preset.id))
        .returning();
      const productsUpdated = result.data.guide ? await syncPresetToProducts(tx, saved) : 0;
      return { preset: saved, productsUpdated };
    });
    return NextResponse.json({ preset, productsUpdated });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "You already have a size guide with that name" }, { status: 409 });
    throw error;
  }
}

// Products using it keep their copy of the table (the link is cleared by
// the ON DELETE SET NULL foreign key) - nothing disappears from the store.
export async function DELETE(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  await db.delete(sizeGuidePresets).where(eq(sizeGuidePresets.id, loaded.preset.id));
  return NextResponse.json({ ok: true });
}
