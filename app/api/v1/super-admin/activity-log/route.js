import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { activityLogs } from "../../../../../lib/db/schema.js";
import { count, desc } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { parsePagination } from "../../../../../lib/pagination.js";

// super_admin only - this is an accountability trail over admin/p_staff,
// not something they should be able to view or clear themselves. See
// lib/activityLog.js for what gets logged here.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const { page, pageSize, limit, offset } = parsePagination(searchParams);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(activityLogs),
  ]);

  return NextResponse.json({
    logs: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
