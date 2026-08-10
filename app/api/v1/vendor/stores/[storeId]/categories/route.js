import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { categories, stores } from "../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createCategorySchema } from "../../../../../../../lib/validate.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(categories).where(eq(categories.storeId, storeId)).orderBy(categories.name);
  return NextResponse.json({ categories: rows });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createCategorySchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.storeId, storeId), eq(categories.slug, result.data.slug)))
    .limit(1);
  if (existing) return NextResponse.json({ error: "That category slug already exists" }, { status: 409 });

  const [created] = await db.insert(categories).values({ storeId, ...result.data }).returning();
  return NextResponse.json({ category: created }, { status: 201 });
}
