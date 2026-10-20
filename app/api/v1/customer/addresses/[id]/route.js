import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { addresses } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../../lib/auth.js";
import { validate, updateAddressSchema } from "../../../../../../lib/validate.js";
import { normaliseCountry } from "../../../../../../lib/countries.js";

async function loadOwnedAddress(user, id) {
  const [row] = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id))).limit(1);
  return row;
}

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwnedAddress(user, id);
  if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(updateAddressSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const updated = await db.transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
    }
    const changes = { ...result.data };
    if ("country" in changes) changes.country = normaliseCountry(changes.country);
    // NOT NULL column: a cleared state (fine abroad) is stored as "".
    if ("state" in changes) changes.state = changes.state || "";
    if ("postalCode" in changes) changes.postalCode = changes.postalCode || null;
    const [row] = await tx.update(addresses).set(changes).where(eq(addresses.id, id)).returning();
    return row;
  });

  return NextResponse.json({ address: updated });
}

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwnedAddress(user, id);
  if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  await db.delete(addresses).where(eq(addresses.id, id));
  return NextResponse.json({ success: true });
}
