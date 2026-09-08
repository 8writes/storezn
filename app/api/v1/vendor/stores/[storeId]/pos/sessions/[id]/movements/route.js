import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { cashMovements } from "@/lib/db/schema.js";
import { validate, cashMovementSchema } from "@/lib/validate.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
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
  if (row.session.status !== "open") {
    return NextResponse.json({ error: "This session is closed" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const result = validate(cashMovementSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const magnitude = toKobo(result.data.amount);
  const amount = result.data.kind === "paid_in" ? magnitude : -magnitude;

  const [movement] = await db
    .insert(cashMovements)
    .values({
      sessionId: id,
      kind: result.data.kind,
      amount,
      reason: result.data.reason,
      createdBy: ctx.user.id,
    })
    .returning();

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
