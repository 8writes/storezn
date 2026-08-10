import { NextResponse } from "next/server";
import { db } from "../../../../../../../../lib/db/index.js";
import { shippingRates, stores } from "../../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";

export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, rateId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rate] = await db.select().from(shippingRates).where(and(eq(shippingRates.id, rateId), eq(shippingRates.storeId, storeId))).limit(1);
  if (!rate) return NextResponse.json({ error: "Shipping rate not found" }, { status: 404 });

  await db.delete(shippingRates).where(eq(shippingRates.id, rateId));
  return NextResponse.json({ success: true });
}
