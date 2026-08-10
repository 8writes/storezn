import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { shippingRates, stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createShippingRateSchema } from "../../../../../../../lib/validate.js";

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

  const rows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, storeId)).orderBy(shippingRates.state, shippingRates.city);
  return NextResponse.json({ shippingRates: rows });
}

// A city-specific rate (city set) and a state-wide rate (city null) for
// the same state can coexist - see the two partial unique indexes on
// shippingRates in lib/db/schema.js. Matching (case-insensitively, same
// reasoning as lib/shipping.js) is done here rather than relying on the
// DB constraint, since state/city casing can vary between submissions.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createShippingRateSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { state, city, fee } = result.data;

  const existingRows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, storeId));
  const duplicate = existingRows.find(
    (r) => r.state.toLowerCase() === state.toLowerCase() && (city ? r.city?.toLowerCase() === city.toLowerCase() : !r.city),
  );
  if (duplicate) {
    return NextResponse.json({ error: city ? "A rate for that state and city already exists" : "A state-wide rate already exists for that state" }, { status: 409 });
  }

  const [created] = await db
    .insert(shippingRates)
    .values({ storeId, state, city: city || null, fee })
    .returning();
  return NextResponse.json({ shippingRate: created }, { status: 201 });
}
