import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../../../../../lib/db/index.js";
import { apiRequestLogs } from "../../../../../lib/db/schema.js";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

function sinceDate(range) {
  const now = Date.now();
  if (range === "1h") return new Date(now - 60 * 60 * 1000);
  if (range === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  return null;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const q = searchParams.get("q")?.trim();
  const statusClass = searchParams.get("status") || "all";
  const since = sinceDate(searchParams.get("range") || "24h");

  const filters = [];
  if (since) filters.push(gte(apiRequestLogs.createdAt, since));
  if (q) {
    filters.push(
      or(
        ilike(apiRequestLogs.source, `%${q}%`),
        ilike(apiRequestLogs.route, `%${q}%`),
        ilike(apiRequestLogs.errorMessage, `%${q}%`),
        ilike(apiRequestLogs.requestId, `%${q}%`),
      ),
    );
  }
  if (statusClass === "2xx") filters.push(and(gte(apiRequestLogs.statusCode, 200), sql`${apiRequestLogs.statusCode} < 300`));
  if (statusClass === "4xx") filters.push(and(gte(apiRequestLogs.statusCode, 400), sql`${apiRequestLogs.statusCode} < 500`));
  if (statusClass === "5xx") filters.push(gte(apiRequestLogs.statusCode, 500));

  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }], [stats], slowRoutes] = await Promise.all([
    db.select().from(apiRequestLogs).where(where).orderBy(desc(apiRequestLogs.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(apiRequestLogs).where(where),
    db
      .select({
        total: count(),
        errors: sql`count(*) filter (where ${apiRequestLogs.statusCode} >= 500)`.mapWith(Number),
        clientErrors: sql`count(*) filter (where ${apiRequestLogs.statusCode} >= 400 and ${apiRequestLogs.statusCode} < 500)`.mapWith(Number),
        avgDurationMs: sql`coalesce(round(avg(${apiRequestLogs.durationMs})), 0)`.mapWith(Number),
      })
      .from(apiRequestLogs)
      .where(where),
    db
      .select({
        route: apiRequestLogs.route,
        source: apiRequestLogs.source,
        hits: count(),
        avgDurationMs: sql`coalesce(round(avg(${apiRequestLogs.durationMs})), 0)`.mapWith(Number),
        maxDurationMs: sql`coalesce(max(${apiRequestLogs.durationMs}), 0)`.mapWith(Number),
        errors: sql`count(*) filter (where ${apiRequestLogs.statusCode} >= 500)`.mapWith(Number),
      })
      .from(apiRequestLogs)
      .where(where)
      .groupBy(apiRequestLogs.route, apiRequestLogs.source)
      .orderBy(desc(sql`coalesce(avg(${apiRequestLogs.durationMs}), 0)`))
      .limit(8),
  ]);

  return NextResponse.json({
    requests: rows,
    stats: stats || { total: 0, errors: 0, clientErrors: 0, avgDurationMs: 0 },
    slowRoutes,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The public status page calculates seven-day availability from this
  // table, so cleanup retains that complete reporting window.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(apiRequestLogs)
    .where(lt(apiRequestLogs.createdAt, cutoff))
    .returning({ id: apiRequestLogs.id });

  return NextResponse.json({ deleted: deleted.length, cutoff });
}
