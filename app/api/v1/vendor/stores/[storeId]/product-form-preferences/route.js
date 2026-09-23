import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, vendorProductFormPreferences } from "../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";

const MAX_FIELDS = 30;

async function context(req, storeId) {
  const user = await getUser(req);
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return null;
  return user;
}

export async function GET(req, { params }) {
  const { storeId } = await params;
  const user = await context(req, storeId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [preference] = await db.select().from(vendorProductFormPreferences).where(and(eq(vendorProductFormPreferences.storeId, storeId), eq(vendorProductFormPreferences.userId, user.id))).limit(1);
  return NextResponse.json({ preference: preference || { visibleFields: [], sectionOrder: [], collapsedSections: [] } });
}

export async function PATCH(req, { params }) {
  const { storeId } = await params;
  const user = await context(req, storeId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.visibleFields) || !Array.isArray(body.sectionOrder) || !Array.isArray(body.collapsedSections)) return NextResponse.json({ error: "Invalid form preferences" }, { status: 400 });
  const values = {
    visibleFields: body.visibleFields.slice(0, MAX_FIELDS).filter((value) => typeof value === "string"),
    sectionOrder: body.sectionOrder.slice(0, MAX_FIELDS).filter((value) => typeof value === "string"),
    collapsedSections: body.collapsedSections.slice(0, MAX_FIELDS).filter((value) => typeof value === "string"),
    updatedAt: new Date(),
  };
  const [preference] = await db.insert(vendorProductFormPreferences).values({ storeId, userId: user.id, ...values }).onConflictDoUpdate({ target: [vendorProductFormPreferences.storeId, vendorProductFormPreferences.userId], set: values }).returning();
  return NextResponse.json({ preference });
}
