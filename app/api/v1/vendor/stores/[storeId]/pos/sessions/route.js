import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, posRegisters, cashMovements } from "@/lib/db/schema.js";
import { validate, openSessionSchema } from "@/lib/validate.js";
import { toKobo } from "@/lib/money.js";
import { posContext, loadRegister } from "@/lib/posAccess.js";

// GET  -> recent sessions for the store (for the session/Z-report list),
//         newest first, register name joined.
// POST -> open a session on a register (one open per register, enforced
//         by uq_pos_sessions_open_register; the opening float is also
//         written as the session's first cash movement).
export async function GET(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const rows = await db
    .select({
      id: posSessions.id,
      registerId: posSessions.registerId,
      registerName: posRegisters.name,
      branchId: posRegisters.branchId,
      status: posSessions.status,
      openedBy: posSessions.openedBy,
      openedAt: posSessions.openedAt,
      openingFloat: posSessions.openingFloat,
      closedAt: posSessions.closedAt,
      expectedCash: posSessions.expectedCash,
      countedCash: posSessions.countedCash,
      overShort: posSessions.overShort,
    })
    .from(posSessions)
    .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
    .where(eq(posRegisters.storeId, storeId))
    .orderBy(desc(posSessions.openedAt))
    .limit(60);

  const scoped =
    ctx.user.role === "staff" && ctx.user.branchId
      ? rows.filter((r) => r.branchId === ctx.user.branchId)
      : rows;

  return NextResponse.json({ sessions: scoped });
}

export async function POST(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const result = validate(openSessionSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const register = await loadRegister(storeId, result.data.registerId, ctx.user);
  if (!register) return NextResponse.json({ error: "Register not found" }, { status: 404 });
  if (!register.isActive) return NextResponse.json({ error: "This register is retired" }, { status: 409 });

  const floatKobo = toKobo(result.data.openingFloat);

  try {
    const session = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(posSessions)
        .values({ registerId: register.id, openedBy: ctx.user.id, openingFloat: floatKobo })
        .returning();
      if (floatKobo > 0) {
        await tx.insert(cashMovements).values({
          sessionId: s.id,
          kind: "float",
          amount: floatKobo,
          createdBy: ctx.user.id,
        });
      }
      return s;
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    // uq_pos_sessions_open_register - a session is already open here.
    if (err?.code === "23505") {
      return NextResponse.json({ error: "This register already has an open session" }, { status: 409 });
    }
    throw err;
  }
}
