import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { shippingRates, stores } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../lib/auth.js";
import { validate, createShippingRateSchema } from "../../../../../../../lib/validate.js";
import { NIGERIA, normaliseCountry } from "../../../../../../../lib/countries.js";
import { isUniqueViolation } from "../../../../../../../lib/dbErrors.js";

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

  const rows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, storeId)).orderBy(shippingRates.country, shippingRates.state, shippingRates.city);
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
  const country = normaliseCountry(result.data.country);
  const state = result.data.state || null;
  const city = result.data.city || null;
  const { fee } = result.data;

  // One rate per place (country + state + city), case-insensitively - the
  // unique index uq_shipping_rates_store_place is the backstop.
  const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const existingRows = await db.select().from(shippingRates).where(eq(shippingRates.storeId, storeId));
  const duplicate = existingRows.find(
    (r) => same(normaliseCountry(r.country), country) && same(r.state, state) && same(r.city, city),
  );
  if (duplicate) {
    const where = city ? `${city}, ${state}` : state ? `${state}${country === NIGERIA ? "" : `, ${country}`}` : country;
    return NextResponse.json({ error: `There's already a delivery rate for ${where}` }, { status: 409 });
  }

  try {
    const [created] = await db
      .insert(shippingRates)
      .values({ storeId, country, state, city, fee })
      .returning();
    return NextResponse.json({ shippingRate: created }, { status: 201 });
  } catch (err) {
    // Lost a race with an identical add (double-click) - same answer.
    if (isUniqueViolation(err)) return NextResponse.json({ error: "That delivery rate already exists" }, { status: 409 });
    throw err;
  }
}
