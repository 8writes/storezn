import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "./db/index.js";
import { products, sizeGuidePresets } from "./db/schema.js";

// Saved size guides: one table typed once per store, used on many
// products. A product that uses a preset keeps a copy of the table in
// products.sizeGuide (so the storefront and everything else just read that)
// plus a link in products.sizeGuidePresetId; editing the preset rewrites
// the copy on every linked product here, in the same transaction.

export async function listSizeGuidePresets(storeId) {
  const presets = await db
    .select()
    .from(sizeGuidePresets)
    .where(eq(sizeGuidePresets.storeId, storeId))
    .orderBy(sizeGuidePresets.name);
  if (presets.length === 0) return [];
  const counts = await db
    .select({ presetId: products.sizeGuidePresetId, productCount: count() })
    .from(products)
    .where(inArray(products.sizeGuidePresetId, presets.map((p) => p.id)))
    .groupBy(products.sizeGuidePresetId);
  const byId = new Map(counts.map((row) => [row.presetId, Number(row.productCount)]));
  return presets.map((preset) => ({ ...preset, productCount: byId.get(preset.id) || 0 }));
}

export async function findStorePreset(storeId, presetId, tx = db) {
  const [preset] = await tx
    .select()
    .from(sizeGuidePresets)
    .where(and(eq(sizeGuidePresets.id, presetId), eq(sizeGuidePresets.storeId, storeId)))
    .limit(1);
  return preset || null;
}

// For product create/update: when the product names a preset, its
// sizeGuide becomes that preset's table (whatever the client sent), so the
// two can never disagree. Returns an error string for a preset that isn't
// this store's. Mutates `data` in place.
export async function applySizeGuidePreset(storeId, data) {
  if (!data || !("sizeGuidePresetId" in data)) return null;
  if (!data.sizeGuidePresetId) {
    data.sizeGuidePresetId = null;
    return null;
  }
  const preset = await findStorePreset(storeId, data.sizeGuidePresetId);
  if (!preset) return "That saved size guide no longer exists";
  data.sizeGuide = preset.guide;
  return null;
}

// Copies a preset's (new) table onto every product that uses it.
export async function syncPresetToProducts(tx, preset) {
  const updated = await tx
    .update(products)
    .set({ sizeGuide: preset.guide, updatedAt: new Date() })
    .where(and(eq(products.storeId, preset.storeId), eq(products.sizeGuidePresetId, preset.id)))
    .returning({ id: products.id });
  return updated.length;
}
