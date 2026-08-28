import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { categories, products, stores } from "../../../../../../../../lib/db/schema.js";
import { and, eq, ne } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { validate, updateCategorySchema } from "../../../../../../../../lib/validate.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

async function loadCategory(storeId, categoryId) {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.storeId, storeId)))
    .limit(1);
  return category;
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, categoryId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = await loadCategory(storeId, categoryId);
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updateCategorySchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (result.data.slug && result.data.slug !== category.slug) {
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.storeId, storeId), eq(categories.slug, result.data.slug), ne(categories.id, categoryId)))
      .limit(1);
    if (clash) return NextResponse.json({ error: "That category slug already exists" }, { status: 409 });
  }

  const [updated] = await db.update(categories).set(result.data).where(eq(categories.id, categoryId)).returning();
  return NextResponse.json({ category: updated });
}

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, categoryId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = await loadCategory(storeId, categoryId);
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Products keep existing, they just lose their category (products.
  // categoryId is nullable) - clearing the reference first also avoids the
  // foreign-key violation a bare delete would hit.
  await db.transaction(async (tx) => {
    await tx.update(products).set({ categoryId: null }).where(eq(products.categoryId, categoryId));
    await tx.delete(categories).where(eq(categories.id, categoryId));
  });

  return NextResponse.json({ success: true });
}
