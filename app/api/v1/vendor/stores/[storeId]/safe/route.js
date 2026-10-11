import { NextResponse, after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { branches, safeMovements } from "@/lib/db/schema.js";
import { validate, safeMovementSchema } from "@/lib/validate.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { posContext, storeBranchIds } from "@/lib/posAccess.js";
import { recordSafeMovement, safeBalance, safeBalancesByBranch, SAFE_KIND_LABEL, summariseSafePeriod } from "@/lib/safe.js";
import { logStoreActivity } from "@/lib/storeActivity.js";
import { parsePagination } from "@/lib/pagination.js";
import { withApiMonitoring } from "@/lib/apiMonitoring.js";

// The back-office safe. Drop/top-up legs are written by the drawer
// movements route (they are two halves of one physical move); this route
// covers the parts with no till involved - stating what's in the safe to
// begin with, paying something straight out of it (the daily
// contribution, a supplier, a bank deposit), and correcting the ledger
// after a physical recount.

async function handleGet(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const branchRows = await storeBranchIds(storeId);
  // A branch-scoped staff member only ever sees their own branch's safe,
  // the same rule the registers follow (see branchAllowed in posAccess).
  const visible = ctx.user.role === "staff" && ctx.user.branchId
    ? branchRows.filter((branch) => branch.id === ctx.user.branchId)
    : branchRows;
  const visibleIds = visible.map((branch) => branch.id);
  if (visibleIds.length === 0) {
    return NextResponse.json({ balanceKobo: 0, byBranch: [], movements: [], totals: summariseSafePeriod([]), pagination: null });
  }

  const { page, pageSize, limit, offset } = parsePagination(new URL(req.url).searchParams);
  const balances = await safeBalancesByBranch(db, storeId);
  const balanceByBranch = new Map(balances.map((row) => [row.branchId, Number(row.balance || 0)]));

  const movements = await db
    .select()
    .from(safeMovements)
    .where(and(eq(safeMovements.storeId, storeId), inArray(safeMovements.branchId, visibleIds)))
    .orderBy(desc(safeMovements.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    balanceKobo: visibleIds.reduce((sum, id) => sum + (balanceByBranch.get(id) || 0), 0),
    byBranch: visible.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      balanceKobo: balanceByBranch.get(branch.id) || 0,
    })),
    movements: movements.map((row) => ({ ...row, label: SAFE_KIND_LABEL[row.kind] || row.kind })),
    totals: summariseSafePeriod(movements),
    pagination: { page, pageSize },
  });
}

async function handlePost(req, { params }) {
  const { storeId } = await params;
  const body = await req.json().catch(() => null);
  const result = validate(safeMovementSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { kind, branchId, amount, reason, clientRef, direction } = result.data;

  // Stating the opening balance or correcting it against a recount is the
  // owner's call - those two move the recorded figure without any cash
  // physically moving, which is exactly the thing staff shouldn't be able
  // to do quietly. Paying the daily contribution out is ordinary shop
  // work, so whoever is there can record it.
  const ownerOnly = kind === "opening" || kind === "adjustment";
  const ctx = await posContext(req, storeId, ownerOnly ? { owner: true } : {});
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const branchRows = await storeBranchIds(storeId);
  const branch = branchRows.find((row) => row.id === branchId);
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  if (ctx.user.role === "staff" && ctx.user.branchId && ctx.user.branchId !== branchId) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const magnitude = toKobo(amount);
  // An adjustment is the only kind that can go either way, so it carries
  // its own direction rather than inferring one from the kind.
  const amountKobo = kind === "adjustment" ? (direction === "down" ? -magnitude : magnitude) : magnitude;

  let recorded;
  try {
    recorded = await db.transaction((tx) => recordSafeMovement(tx, {
      storeId,
      branchId,
      kind,
      amountKobo,
      reason: reason || null,
      createdBy: ctx.user.id,
      clientRef: clientRef || null,
    }));
  } catch (err) {
    if (err?.code === "INSUFFICIENT_SAFE_CASH") {
      return NextResponse.json(
        { error: `${err.message} - ${formatKobo(err.balanceKobo)} is recorded for this branch.`, code: err.code },
        { status: 409 },
      );
    }
    // Lost a race with an identical request; the partial unique index on
    // (branch_id, client_ref) rejected the second insert.
    if (clientRef && /unique|duplicate key/i.test(err?.message || "")) {
      const [winner] = await db
        .select()
        .from(safeMovements)
        .where(and(eq(safeMovements.branchId, branchId), eq(safeMovements.clientRef, clientRef)))
        .limit(1);
      if (winner) return NextResponse.json({ movement: winner, replayed: true }, { status: 200 });
    }
    // One opening balance per branch (uq_safe_movements_opening).
    if (kind === "opening" && /uq_safe_movements_opening/i.test(err?.message || "")) {
      return NextResponse.json(
        { error: "This branch already has an opening balance - record an adjustment instead" },
        { status: 409 },
      );
    }
    throw err;
  }

  if (!recorded.replayed) {
    const balanceKobo = await safeBalance(db, branchId);
    after(() => logStoreActivity({
      storeId,
      actor: ctx.user,
      branchId,
      action: `safe.${kind}`,
      summary: `${SAFE_KIND_LABEL[kind]} ${formatKobo(Math.abs(amountKobo))} at ${branch.name}${reason ? ` · ${reason}` : ""}`,
      targetType: "safe",
      targetId: recorded.movement.id,
      metadata: { kind, amountKobo, reason: reason || null, balanceKobo },
    }));
  }

  return NextResponse.json(
    { movement: recorded.movement, replayed: recorded.replayed, balanceKobo: await safeBalance(db, branchId) },
    { status: recorded.replayed ? 200 : 201 },
  );
}

export const GET = withApiMonitoring(handleGet, { source: "vendor.safe.list" });
export const POST = withApiMonitoring(handlePost, { source: "vendor.safe.record" });
