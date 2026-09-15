import { NextResponse } from "next/server";
import { and, count, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../../../../../lib/db/index.js";
import { appErrorLogs } from "../../../../../lib/db/schema.js";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

function filtersFrom(searchParams) {
  const filters = [];
  const q = searchParams.get("q")?.trim();
  const level = searchParams.get("level")?.trim();
  const resolved = searchParams.get("resolved")?.trim();

  if (q) {
    filters.push(
      or(
        ilike(appErrorLogs.message, `%${q}%`),
        ilike(appErrorLogs.source, `%${q}%`),
        ilike(appErrorLogs.route, `%${q}%`),
        ilike(appErrorLogs.name, `%${q}%`),
        ilike(appErrorLogs.requestId, `%${q}%`),
      ),
    );
  }
  if (level && level !== "all") filters.push(eq(appErrorLogs.level, level));
  if (resolved === "true") filters.push(eq(appErrorLogs.resolved, true));
  if (resolved === "false") filters.push(eq(appErrorLogs.resolved, false));

  return filters;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);
  const filters = filtersFrom(searchParams);
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }], [stats]] = await Promise.all([
    db.select().from(appErrorLogs).where(where).orderBy(desc(appErrorLogs.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(appErrorLogs).where(where),
    db
      .select({
        open: sql`count(*) filter (where ${appErrorLogs.resolved} = false)`.mapWith(Number),
        resolved: sql`count(*) filter (where ${appErrorLogs.resolved} = true)`.mapWith(Number),
      })
      .from(appErrorLogs),
  ]);

  return NextResponse.json({
    errors: rows,
    stats: stats || { open: 0, resolved: 0 },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function PATCH(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const resolved = body.resolved !== false;
  const [updated] = await db
    .update(appErrorLogs)
    .set({
      resolved,
      resolvedBy: resolved ? user.id : null,
      resolvedAt: resolved ? new Date() : null,
    })
    .where(eq(appErrorLogs.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Error log not found" }, { status: 404 });
  return NextResponse.json({ error: updated });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const deleted = await db
    .delete(appErrorLogs)
    .where(lt(appErrorLogs.createdAt, cutoff))
    .returning({ id: appErrorLogs.id });

  return NextResponse.json({ deleted: deleted.length, cutoff });
}
