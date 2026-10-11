import { and, eq, sql } from "drizzle-orm";
import { safeMovements } from "./db/schema.js";

// The back-office safe, as a ledger. Mirrors lib/pos.js's treatment of
// the cash drawer: signed kobo, + into the safe, and the balance is
// always SUM(amount) rather than a cached column, so a correction is just
// another row and the figure can never drift out of step with its own
// history. See lib/db/schema.js's safeMovements for why the drawer legs
// carry a cashMovementId.

export const SAFE_KIND_LABEL = {
  opening: "Opening balance",
  drop_in: "Cash dropped from a till",
  topup_out: "Topped up a till",
  expense_out: "Paid out",
  adjustment: "Adjustment",
};

// Which way each kind moves the money. `adjustment` is the one that can
// go either way, so it carries its own sign from the caller.
const SIGN = { opening: 1, drop_in: 1, topup_out: -1, expense_out: -1 };

export function signedSafeAmount(kind, magnitudeKobo) {
  const raw = Math.round(Number(magnitudeKobo) || 0);
  const sign = SIGN[kind];
  // An adjustment is the only kind whose direction comes from the caller
  // (a recount can find more OR less), so its sign must survive - taking
  // the magnitude here turned every downward correction into a deposit.
  if (!sign) return raw;
  return sign * Math.abs(raw);
}

export async function safeBalance(tx, branchId) {
  const [row] = await tx
    .select({ total: sql`coalesce(sum(${safeMovements.amount}), 0)`.mapWith(Number) })
    .from(safeMovements)
    .where(eq(safeMovements.branchId, branchId));
  return Number(row?.total || 0);
}

export async function safeBalancesByBranch(tx, storeId) {
  return tx
    .select({
      branchId: safeMovements.branchId,
      balance: sql`coalesce(sum(${safeMovements.amount}), 0)`.mapWith(Number),
    })
    .from(safeMovements)
    .where(eq(safeMovements.storeId, storeId))
    .groupBy(safeMovements.branchId);
}

export class SafeShortfallError extends Error {
  constructor(balanceKobo) {
    super("There isn't that much recorded in the safe");
    this.name = "SafeShortfallError";
    this.code = "INSUFFICIENT_SAFE_CASH";
    this.balanceKobo = balanceKobo;
  }
}

// Writes one safe movement. MUST run inside the caller's transaction:
// a drawer leg and its safe leg have to commit or fail together, or the
// two ledgers disagree about money that physically moved once.
//
// The advisory lock is per branch and is what makes the shortfall check
// below truthful - without it two concurrent top-ups can both read a
// sufficient balance and both succeed, overdrawing a safe that only ever
// held one of them. Same pattern as lockPosSession in lib/posSession.js.
export async function recordSafeMovement(tx, {
  storeId,
  branchId,
  kind,
  amountKobo,
  reason = null,
  sessionId = null,
  cashMovementId = null,
  createdBy,
  clientRef = null,
}) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`safe:${branchId}`}))`);

  if (clientRef) {
    const [existing] = await tx
      .select()
      .from(safeMovements)
      .where(and(eq(safeMovements.branchId, branchId), eq(safeMovements.clientRef, clientRef)))
      .limit(1);
    if (existing) return { movement: existing, replayed: true };
  }

  const amount = signedSafeAmount(kind, amountKobo);
  if (amount < 0) {
    const balance = await safeBalance(tx, branchId);
    if (balance + amount < 0) throw new SafeShortfallError(balance);
  }

  const [movement] = await tx
    .insert(safeMovements)
    .values({ storeId, branchId, kind, amount, reason, sessionId, cashMovementId, createdBy, clientRef })
    .returning();
  return { movement, replayed: false };
}

// Totals for a set of rows, for the safe page and the monthly report.
export function summariseSafePeriod(rows) {
  const totals = { opening: 0, droppedIn: 0, toppedUp: 0, paidOut: 0, adjustments: 0, net: 0 };
  for (const row of rows || []) {
    const amount = Number(row.amount || 0);
    totals.net += amount;
    if (row.kind === "opening") totals.opening += amount;
    else if (row.kind === "drop_in") totals.droppedIn += amount;
    else if (row.kind === "topup_out") totals.toppedUp += Math.abs(amount);
    else if (row.kind === "expense_out") totals.paidOut += Math.abs(amount);
    else if (row.kind === "adjustment") totals.adjustments += amount;
  }
  return totals;
}
