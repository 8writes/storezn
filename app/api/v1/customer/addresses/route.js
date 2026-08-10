import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { addresses } from "../../../../../lib/db/schema.js";
import { desc, eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { validate, createAddressSchema } from "../../../../../lib/validate.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return NextResponse.json({ addresses: rows });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const result = validate(createAddressSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const created = await db.transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
    }
    const [row] = await tx.insert(addresses).values({ userId: user.id, ...result.data }).returning();
    return row;
  });

  return NextResponse.json({ address: created }, { status: 201 });
}
