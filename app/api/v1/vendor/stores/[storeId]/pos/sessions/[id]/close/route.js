import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posSessions, posHeldSales } from "@/lib/db/schema.js";
import { validate, closeSessionSchema } from "@/lib/validate.js";
import { toKobo, formatKobo } from "@/lib/money.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { buildPosSessionSummary, lockPosSession } from "@/lib/posSession.js";
import { openingBasisOf, posOverShortReview, resolveCloseCount } from "@/lib/pos.js";
import { logStoreActivity } from "@/lib/storeActivity.js";

export async function POST(req, { params }) {
  const { storeId, id } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const row = await loadSession(storeId, id, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const result = validate(closeSessionSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { forced, forcedReason, countBreakdown } = result.data;
  const pendingSyncCount = result.data.pendingSyncCount || 0;
  let closeResult;
  try {
    closeResult = await db.transaction(async (tx) => {
      const session = await lockPosSession(tx, id);
      if (!session) {
        throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      }
      if (session.status !== "open") {
        throw Object.assign(new Error("This session is already closed"), { code: "SESSION_CLOSED" });
      }

      const [held] = await tx.select({ id: posHeldSales.id }).from(posHeldSales)
        .where(eq(posHeldSales.sessionId, id)).limit(1);
      if (held) {
        throw Object.assign(
          new Error("Recall and finish (or discard) every held sale before closing the register"),
          { code: "HELD_SALE" },
        );
      }

      const summary = await buildPosSessionSummary(tx, session);
      const expectedCash = summary.drawer.expectedCash;
      // Decided in lib/pos.js so it can be tested without a database -
      // over/short is the figure staff are judged on. The change pot is
      // recorded alongside the count and never inside it; see
      // CHANGE_FLOAT_BELOW for why both sides must exclude it.
      const { countedCash, closingChangeCash, closeMethod } = resolveCloseCount({
        forced,
        countBreakdown,
        countedCashKobo: result.data.countedCash == null ? 0 : toKobo(result.data.countedCash),
        closingChangeCashKobo: result.data.closingChangeCash == null ? null : toKobo(result.data.closingChangeCash),
        expectedCash,
      });

      const overShort = countedCash - expectedCash;
      const provisional = pendingSyncCount > 0;
      // Per-store, replacing a flat ₦500 that flagged practically every
      // close once the pot stopped being counted into the drawer figure.
      const { reviewStatus, toleranceKobo } = posOverShortReview({
        overShort,
        forced,
        provisional,
        toleranceKobo: ctx.store.posOverShortTolerance,
      });
      const zReport = {
        ...summary, countedCash, expectedCash, overShort, closedBy: ctx.user.id,
        closeMethod, provisional, pendingSyncCount, reviewStatus, closingChangeCash,
        // Frozen into the snapshot so the Z describes itself forever: a
        // later tolerance change must not silently re-judge a past shift,
        // and the basis is what tells the reader whether the pot was
        // inside the opening figure.
        openingBasis: openingBasisOf(session),
        openingChangeCash: session.openingChangeCash ?? null,
        overShortToleranceKobo: toleranceKobo,
      };
      const [closed] = await tx.update(posSessions).set({
        status: "closed", closedBy: ctx.user.id, closedAt: new Date(), countedCash,
        expectedCash, overShort, closeMethod, countBreakdown: countBreakdown || null, closingChangeCash,
        forcedReason: forced ? forcedReason : null, provisional, pendingSyncCount,
        reviewStatus, zReport,
      }).where(and(eq(posSessions.id, id), eq(posSessions.status, "open"))).returning();
      if (!closed) {
        throw Object.assign(new Error("This session is already closed"), { code: "SESSION_CLOSED" });
      }
      return { closed, summary, countedCash, expectedCash, overShort, provisional, reviewStatus, closeMethod, closingChangeCash, toleranceKobo };
    });
  } catch (error) {
    if (["NOT_FOUND", "SESSION_CLOSED", "HELD_SALE"].includes(error.code)) {
      return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    }
    throw error;
  }

  const { closed, summary, countedCash, expectedCash, overShort, provisional, reviewStatus, closeMethod, toleranceKobo } = closeResult;
  after(() => logStoreActivity({
    storeId,
    actor: ctx.user,
    branchId: row.register.branchId,
    action: "register.close",
    summary: `Closed ${row.register.name} - ${forced
      ? `NOT COUNTED, used the system figure ${formatKobo(expectedCash)} (${forcedReason})`
      : `counted ${formatKobo(countedCash)} vs expected ${formatKobo(expectedCash)}` +
        (overShort === 0 ? " (balanced)" : ` (${overShort > 0 ? "over" : "short"} ${formatKobo(Math.abs(overShort))})`)}` +
      (provisional ? ` - PROVISIONAL, ${pendingSyncCount} sale(s) not synced` : ""),
    targetType: "session",
    targetId: id,
    metadata: {
      registerName: row.register.name, countedCashKobo: countedCash, expectedCashKobo: expectedCash,
      overShortKobo: overShort, closeMethod, forcedReason: forced ? forcedReason : null,
      provisional, pendingSyncCount, reviewStatus, saleCount: summary.saleCount,
      grossSalesKobo: summary.grossSales,
      // Why it was (or wasn't) flagged, so the audit trail stands alone.
      overShortToleranceKobo: toleranceKobo,
    },
  }));

  return NextResponse.json({ session: closed, zReport: closed.zReport });
}
