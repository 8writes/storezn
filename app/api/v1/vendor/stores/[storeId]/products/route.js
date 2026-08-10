import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { products, stores } from "../../../../../../../lib/db/schema.js";
import { and, count, eq, ilike } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createProductSchema } from "../../../../../../../lib/validate.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

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

  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim();
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const conditions = [eq(products.storeId, storeId)];
  if (q) conditions.push(ilike(products.name, `%${q}%`));

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(products).where(and(...conditions)).orderBy(products.createdAt).limit(limit).offset(offset),
    db.select({ total: count() }).from(products).where(and(...conditions)),
  ]);

  return NextResponse.json({
    products: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
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

  const result = validate(createProductSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.slug, result.data.slug)))
    .limit(1);
  if (existing) return NextResponse.json({ error: "That product slug already exists" }, { status: 409 });

  const [created] = await db.insert(products).values({ storeId, ...result.data }).returning();
  return NextResponse.json({ product: created }, { status: 201 });
}
