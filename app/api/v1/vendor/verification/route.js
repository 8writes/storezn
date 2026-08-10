import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, submitNinSchema } from "../../../../../lib/validate.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["vendor"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    approvalStatus: user.approvalStatus,
    nin: user.nin,
    ninSubmittedAt: user.ninSubmittedAt,
    approvalReviewNote: user.approvalReviewNote,
  });
}

// A vendor's store stays unlisted/can't take orders (see
// lib/resolveStore.js's isStoreLive) until this is approved - submitting
// (including resubmitting after a rejection) always resets
// approvalStatus back to "pending", clearing any previous review note.
export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["vendor"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.approvalStatus === "approved") {
    return NextResponse.json({ error: "You're already verified" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(submitNinSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const [updated] = await db
    .update(users)
    .set({
      nin: result.data.nin,
      ninSubmittedAt: new Date(),
      approvalStatus: "pending",
      approvalReviewNote: null,
      approvalReviewedBy: null,
      approvalReviewedAt: null,
    })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({
    approvalStatus: updated.approvalStatus,
    nin: updated.nin,
    ninSubmittedAt: updated.ninSubmittedAt,
    approvalReviewNote: updated.approvalReviewNote,
  });
}
