import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posHeldSales, posSessions, posRegisters } from "@/lib/db/schema.js";
import { posContext } from "@/lib/posAccess.js";

// Discard a parked sale (also called after a successful recall, once the
// cart has been re-hydrated on the client).
export async function DELETE(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const [row] = await db
    .select({ held: posHeldSales, branchId: posRegisters.branchId })
    .from(posHeldSales)
    .innerJoin(posSessions, eq(posHeldSales.sessionId, posSessions.id))
    .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
    .where(and(eq(posHeldSales.id, id), eq(posRegisters.storeId, storeId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Held sale not found" }, { status: 404 });
  if (ctx.user.role === "staff" && ctx.user.branchId && row.branchId !== ctx.user.branchId) {
    return NextResponse.json({ error: "Held sale not found" }, { status: 404 });
  }

  await db.delete(posHeldSales).where(eq(posHeldSales.id, id));
  return NextResponse.json({ ok: true });
}
