import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { categories, products, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, eq } from "drizzle-orm";
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

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.storeId, storeId))
    .orderBy(categories.name);

  // productCount lets the manage-categories page warn before deleting a
  // category that still has products under it (they're just un-categorised,
  // not deleted - see the [categoryId] DELETE route). Kept as its own
  // grouped query so the category list itself stays a plain, cheap select.
  const counts = await db
    .select({ categoryId: products.categoryId, n: count() })
    .from(products)
    .where(eq(products.storeId, storeId))
    .groupBy(products.categoryId);
  const countByCategory = Object.fromEntries(counts.map((c) => [c.categoryId, Number(c.n)]));

  return NextResponse.json({
    categories: rows.map((r) => ({ ...r, productCount: countByCategory[r.id] || 0 })),
  });
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
