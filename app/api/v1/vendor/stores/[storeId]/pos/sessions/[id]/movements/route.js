import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { cashMovements } from "@/lib/db/schema.js";
import { validate, cashMovementSchema } from "@/lib/validate.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { lockPosSession } from "@/lib/posSession.js";
import { logStoreActivity } from "@/lib/storeActivity.js";

// Cashier cash-drawer actions: paid_in (+), paid_out (-), drop (-).
// cash_sale / cash_refund are written by the sale/return routes, not
// here. Every one needs a reason.
export async function POST(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const result = validate(cashMovementSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const magnitude = toKobo(result.data.amount);
  const amount = result.data.kind === "paid_in" ? magnitude : -magnitude;
  const clientRef = result.data.clientRef || null;

  // Idempotent on clientRef: a retry / double-tap with the same key
  // returns the movement that already landed instead of recording it
  // again (the incident this guards against: one payout written 27x on a
  // flaky connection).
  let movement;
  let replayed = false;
  try {
    ({ movement, replayed } = await db.transaction(async (tx) => {
      const session = await lockPosSession(tx, id);
      if (!session || session.storeId !== storeId) {
        throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      }
      if (session.status !== "open") {
        throw Object.assign(new Error("This session is closed"), { code: "SESSION_CLOSED" });
      }
      if (clientRef) {
        const [existing] = await tx.select().from(cashMovements)
          .where(and(eq(cashMovements.sessionId, id), eq(cashMovements.clientRef, clientRef))).limit(1);
        if (existing) return { movement: existing, replayed: true };
      }
      const [created] = await tx.insert(cashMovements).values({
        sessionId: id,
        kind: result.data.kind,
        amount,
        reason: result.data.reason,
        createdBy: ctx.user.id,
        clientRef,
      }).returning();
      return { movement: created, replayed: false };
    }));
  } catch (err) {
    // Lost the race with a concurrent identical request - the unique
    // index (session_id, client_ref) rejected the second insert. Return
    // the row the winner wrote.
    if (clientRef && /unique|duplicate key/i.test(err.message || "")) {
      const [winner] = await db
        .select()
        .from(cashMovements)
        .where(and(eq(cashMovements.sessionId, id), eq(cashMovements.clientRef, clientRef)))
        .limit(1);
      if (winner) return NextResponse.json({ movement: winner, replayed: true }, { status: 200 });
    }
    if (["NOT_FOUND", "SESSION_CLOSED"].includes(err.code)) {
      return NextResponse.json({ error: err.message }, { status: err.code === "NOT_FOUND" ? 404 : 409 });
    }
    throw err;
  }

  if (replayed) return NextResponse.json({ movement, replayed: true }, { status: 200 });

  const label = { paid_in: "Paid in", paid_out: "Paid out", drop: "Cash drop" }[result.data.kind] || result.data.kind;
  after(() =>
    logStoreActivity({
      storeId,
      actor: ctx.user,
      branchId: row.register.branchId,
      action: `cash.${result.data.kind}`,
      summary: `${label} ${formatKobo(magnitude)} · ${result.data.reason}`,
      targetType: "session",
      targetId: id,
      metadata: { kind: result.data.kind, amountKobo: magnitude, reason: result.data.reason },
    }),
  );

  return NextResponse.json({ movement }, { status: 201 });
}
