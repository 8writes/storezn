import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posRegisters, posSessions, branches } from "@/lib/db/schema.js";
import { validate, createRegisterSchema } from "@/lib/validate.js";
import { posContext } from "@/lib/posAccess.js";

// GET  -> registers for the store (branch-scoped staff see only theirs),
//         each with its current open session id if any.
// POST -> create a register (owner only).
export async function GET(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const rows = await db
    .select({
      id: posRegisters.id,
      name: posRegisters.name,
      branchId: posRegisters.branchId,
      branchName: branches.name,
      isActive: posRegisters.isActive,
    })
    .from(posRegisters)
    .leftJoin(branches, eq(posRegisters.branchId, branches.id))
    .where(eq(posRegisters.storeId, storeId))
    .orderBy(posRegisters.createdAt);

  const scoped =
    ctx.user.role === "staff" && ctx.user.branchId
      ? rows.filter((r) => r.branchId === ctx.user.branchId)
      : rows;

  const open = await db
    .select({ id: posSessions.id, registerId: posSessions.registerId, openedAt: posSessions.openedAt })
    .from(posSessions)
    .where(eq(posSessions.status, "open"));
  const openByRegister = new Map(open.map((s) => [s.registerId, s]));

  return NextResponse.json({
    registers: scoped.map((r) => ({ ...r, openSession: openByRegister.get(r.id) || null })),
  });
}

export async function POST(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId, { owner: true });
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const result = validate(createRegisterSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, result.data.branchId), eq(branches.storeId, storeId)))
    .limit(1);
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const [created] = await db
    .insert(posRegisters)
    .values({ storeId, branchId: branch.id, name: result.data.name })
    .returning();

  return NextResponse.json({ register: created }, { status: 201 });
}
