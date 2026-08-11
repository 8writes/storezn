import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { stores } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, createStoreSchema } from "../../../../../lib/validate.js";

// A vendor can own more than one store (see stores.ownerId in
// lib/db/schema.js), capped here rather than in the schema itself - a
// small, product-level limit that's cheap to change later, not a
// structural one.
const MAX_STORES_PER_VENDOR = 3;

// A vendor's own store(s).
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["vendor"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(stores).where(eq(stores.ownerId, user.id)).orderBy(stores.createdAt);
  return NextResponse.json({ stores: rows });
}

// Adds another store to an already-signed-up vendor - the only other way
// a store gets created besides /api/v1/vendor/signup (which makes the
// vendor's first one). New stores start approvalStatus-gated the same way
// the vendor's account already is: nothing extra to submit here, since
// that's identity verification on the vendor, not per-store.
export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["vendor"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, user.id));
  if (existing.length >= MAX_STORES_PER_VENDOR) {
    return NextResponse.json({ error: `You can have up to ${MAX_STORES_PER_VENDOR} stores` }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createStoreSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [existingSlug] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, result.data.slug)).limit(1);
  if (existingSlug) return NextResponse.json({ error: "That store slug is already in use" }, { status: 409 });

  const [created] = await db.insert(stores).values({ ownerId: user.id, ...result.data }).returning();
  return NextResponse.json({ store: created }, { status: 201 });
}
