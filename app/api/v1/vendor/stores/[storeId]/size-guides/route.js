import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { sizeGuidePresets, stores } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createSizeGuidePresetSchema } from "../../../../../../../lib/validate.js";
import { isUniqueViolation } from "../../../../../../../lib/dbErrors.js";
import { listSizeGuidePresets } from "../../../../../../../lib/sizeGuidePresets.js";

// The store's saved size guides (lib/sizeGuidePresets.js).
async function load(req, params) {
  const user = await getUser(req);
  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user, store };
}

export async function GET(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  return NextResponse.json({ presets: await listSizeGuidePresets(loaded.store.id) });
}

export async function POST(req, { params }) {
  const loaded = await load(req, params);
  if (loaded.error) return loaded.error;
  const body = await req.json().catch(() => null);
  const result = validate(createSizeGuidePresetSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  try {
    const [preset] = await db
      .insert(sizeGuidePresets)
      .values({ storeId: loaded.store.id, name: result.data.name, guide: result.data.guide })
      .returning();
    return NextResponse.json({ preset: { ...preset, productCount: 0 } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "You already have a size guide with that name" }, { status: 409 });
    throw error;
  }
}
