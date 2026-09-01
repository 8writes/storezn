import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posRegisters, posSessions } from "@/lib/db/schema.js";
import { validate, updateRegisterSchema } from "@/lib/validate.js";
import { posContext, loadRegister } from "@/lib/posAccess.js";

export async function PATCH(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId, { owner: true });
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const reg = await loadRegister(storeId, id, ctx.user);
  if (!reg) return NextResponse.json({ error: "Register not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const result = validate(updateRegisterSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Can't deactivate a register that's mid-shift.
  if (result.data.isActive === false) {
    const [open] = await db
      .select({ id: posSessions.id })
      .from(posSessions)
      .where(and(eq(posSessions.registerId, id), eq(posSessions.status, "open")))
      .limit(1);
    if (open) return NextResponse.json({ error: "Close the open session before deactivating this register" }, { status: 409 });
  }

  const [updated] = await db
    .update(posRegisters)
    .set(result.data)
    .where(eq(posRegisters.id, id))
    .returning();
  return NextResponse.json({ register: updated });
}

export async function DELETE(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId, { owner: true });
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const reg = await loadRegister(storeId, id, ctx.user);
  if (!reg) return NextResponse.json({ error: "Register not found" }, { status: 404 });

  // A register with shift history is soft-retired (isActive = false) so
  // its Z-reports stay reachable; a never-used one is removed outright.
  const [everUsed] = await db
    .select({ id: posSessions.id })
    .from(posSessions)
    .where(eq(posSessions.registerId, id))
    .limit(1);

  if (everUsed) {
    const [open] = await db
      .select({ id: posSessions.id })
      .from(posSessions)
      .where(and(eq(posSessions.registerId, id), eq(posSessions.status, "open")))
      .limit(1);
    if (open) return NextResponse.json({ error: "Close the open session first" }, { status: 409 });
    await db.update(posRegisters).set({ isActive: false }).where(eq(posRegisters.id, id));
    return NextResponse.json({ ok: true, retired: true });
  }

  await db.delete(posRegisters).where(eq(posRegisters.id, id));
  return NextResponse.json({ ok: true });
}
