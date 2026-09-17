import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { stores, storeActivityLogs } from "@/lib/db/schema.js";
import { getUser, isStoreOwner } from "@/lib/auth.js";

export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId, activityId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) {
    return NextResponse.json({ error: "Only the store owner can review activity" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!['flag', 'review', 'clear'].includes(action)) {
    return NextResponse.json({ error: "Action must be flag, review, or clear" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 500) return NextResponse.json({ error: "Flag note cannot exceed 500 characters" }, { status: 400 });

  const values = action === "flag"
    ? { flaggedAt: new Date(), reviewedAt: null, flagNote: note || null }
    : action === "review"
      ? { reviewedAt: new Date() }
      : { flaggedAt: null, reviewedAt: null, flagNote: null };

  const [activity] = await db.update(storeActivityLogs)
    .set(values)
    .where(and(eq(storeActivityLogs.id, activityId), eq(storeActivityLogs.storeId, storeId)))
    .returning();
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });

  return NextResponse.json({ activity });
}
