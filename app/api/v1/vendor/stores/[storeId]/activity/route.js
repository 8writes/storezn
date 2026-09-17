import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, isNotNull, isNull, like, lt, or } from "drizzle-orm";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, storeActivityLogs, branches } from "../../../../../../../lib/db/schema.js";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { parsePagination } from "../../../../../../../lib/pagination.js";

// The store's audit trail - every important staff/owner action logged by
// lib/storeActivity.js. Owner-only (isStoreOwner): a staff member helps
// run the store but doesn't get to see the log of who did what.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) {
    return NextResponse.json({ error: "Only the store owner can view the activity log" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(sp);

  const conds = [eq(storeActivityLogs.storeId, storeId)];
  const actor = sp.get("actorId")?.trim();
  if (actor) conds.push(eq(storeActivityLogs.actorId, actor));
  // action group, e.g. "pos" -> pos.sale / pos.return / pos.sale.adjusted
  const group = sp.get("group")?.trim();
  if (group && /^[a-z_]+$/.test(group)) {
    conds.push(or(eq(storeActivityLogs.action, group), like(storeActivityLogs.action, `${group}.%`)));
  }
  if (sp.get("flagged") === "true") {
    conds.push(isNotNull(storeActivityLogs.flaggedAt), isNull(storeActivityLogs.reviewedAt));
  }
  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();
  if (from) {
    const d = new Date(`${from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) conds.push(gte(storeActivityLogs.createdAt, d));
  }
  if (to) {
    const d = new Date(`${to}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) conds.push(lt(storeActivityLogs.createdAt, new Date(d.getTime() + 86_400_000)));
  }

  const [rowsRaw, [{ total }]] = await Promise.all([
    db
      .select({ log: storeActivityLogs, branchName: branches.name })
      .from(storeActivityLogs)
      .leftJoin(branches, eq(branches.id, storeActivityLogs.branchId))
      .where(and(...conds))
      .orderBy(desc(storeActivityLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(storeActivityLogs).where(and(...conds)),
  ]);

  return NextResponse.json({
    activity: rowsRaw.map((r) => ({
      id: r.log.id,
      action: r.log.action,
      summary: r.log.summary,
      actorName: r.log.actorName,
      actorRole: r.log.actorRole,
      actorId: r.log.actorId,
      branchName: r.branchName || null,
      targetType: r.log.targetType,
      targetId: r.log.targetId,
      metadata: r.log.metadata,
      flaggedAt: r.log.flaggedAt,
      flagNote: r.log.flagNote,
      reviewedAt: r.log.reviewedAt,
      createdAt: r.log.createdAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
