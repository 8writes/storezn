import { NextResponse, after } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, posRegisters, cashMovements } from "@/lib/db/schema.js";
import { validate, openSessionSchema } from "@/lib/validate.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { posContext, loadRegister } from "@/lib/posAccess.js";
import { DEFAULT_OVER_SHORT_TOLERANCE_KOBO, OPENING_BASIS, splitCountBreakdown } from "@/lib/pos.js";
import { logStoreActivity } from "@/lib/storeActivity.js";
import { parsePagination } from "@/lib/pagination.js";
import { isUniqueViolation } from "@/lib/dbErrors.js";

// GET  -> recent sessions for the store (for the session/Z-report list),
//         newest first, register name joined.
// POST -> open a session on a register (one open per register, enforced
//         by uq_pos_sessions_open_register; the opening float is also
//         written as the session's first cash movement).
export async function GET(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const searchParams = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  // Store/branch scope, shared by the list and the unfiltered badge count.
  const scopeWhere = [eq(posRegisters.storeId, storeId)];
  if (ctx.user.role === "staff" && ctx.user.branchId) scopeWhere.push(eq(posRegisters.branchId, ctx.user.branchId));
  // Filtered in SQL, not on the page, so `total` and the paging stay
  // honest - an owner hunting the flagged closes was previously left to
  // eyeball the whole list.
  const where = [...scopeWhere];
  if (searchParams.get("reviewStatus") === "pending") where.push(eq(posSessions.reviewStatus, "pending"));

  const [rows, [{ total }], [{ total: pendingReview }]] = await Promise.all([
    db
      .select({
        id: posSessions.id,
        registerId: posSessions.registerId,
        registerName: posRegisters.name,
        branchId: posRegisters.branchId,
        status: posSessions.status,
        openedBy: posSessions.openedBy,
        openedAt: posSessions.openedAt,
        openingFloat: posSessions.openingFloat,
        // The list marks pre-fix shifts, which all read short by about the
        // change pot and must not look like a cashier's variance.
        openingBasis: posSessions.openingBasis,
        closedAt: posSessions.closedAt,
        expectedCash: posSessions.expectedCash,
        countedCash: posSessions.countedCash,
        overShort: posSessions.overShort,
        closeMethod: posSessions.closeMethod,
        provisional: posSessions.provisional,
        reviewStatus: posSessions.reviewStatus,
      })
      .from(posSessions)
      .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
      .where(and(...where))
      .orderBy(desc(posSessions.openedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(posSessions)
      .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
      .where(and(...where)),
    // Counted without the review filter applied, so the badge still reads
    // the true outstanding total while the list itself is filtered.
    db
      .select({ total: count() })
      .from(posSessions)
      .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
      .where(and(...scopeWhere, eq(posSessions.reviewStatus, "pending"))),
  ]);

  return NextResponse.json({
    sessions: rows,
    // So the list can colour an over/short by whether it actually cleared
    // this store's threshold, instead of shouting at every non-zero value.
    overShortToleranceKobo: ctx.store.posOverShortTolerance || DEFAULT_OVER_SHORT_TOLERANCE_KOBO,
    pendingReviewCount: pendingReview,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
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

  // The opening figure is the COUNTABLE pile (notes >= CHANGE_FLOAT_BELOW)
  // and never the change pot, because that is exactly what the close
  // counts. When the notes are entered one by one the split is derived
  // here rather than trusted from the device - same rule as the close
  // route - and the pot comes along as a recorded figure only.
  let floatKobo;
  let openingChangeCash = null;
  if (result.data.openingCountBreakdown) {
    const split = splitCountBreakdown(result.data.openingCountBreakdown);
    floatKobo = split.countedKobo;
    openingChangeCash = split.changeFloatKobo;
  } else {
    floatKobo = toKobo(result.data.openingFloat);
    openingChangeCash = result.data.openingChangeCash == null ? null : toKobo(result.data.openingChangeCash);
  }

  try {
    const session = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(posSessions)
        .values({
          registerId: register.id,
          openedBy: ctx.user.id,
          openingFloat: floatKobo,
          openingBasis: OPENING_BASIS.COUNTED_NOTES,
          openingChangeCash,
        })
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
    after(() =>
      logStoreActivity({
        storeId,
        actor: ctx.user,
        branchId: register.branchId,
        action: "register.open",
        summary: `Opened ${register.name} with ${formatKobo(floatKobo)} in countable notes`
          + (openingChangeCash != null ? ` (change pot ${formatKobo(openingChangeCash)})` : ""),
        targetType: "session",
        targetId: session.id,
        metadata: {
          registerName: register.name,
          openingFloatKobo: floatKobo,
          openingBasis: OPENING_BASIS.COUNTED_NOTES,
          openingChangeCashKobo: openingChangeCash,
        },
      }),
    );
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    // uq_pos_sessions_open_register - a session is already open here.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "This register already has an open session" }, { status: 409 });
    }
    throw err;
  }
}
