import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { users } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { validate, reviewVendorApprovalSchema } from "../../../../../../lib/validate.js";
import { sendPushToUser } from "../../../../../../lib/push.js";
import { logActivity } from "../../../../../../lib/activityLog.js";

// Approves or rejects a vendor's submitted NIN - see users.approvalStatus
// in lib/db/schema.js. Approving is what actually lets their store go
// live (lib/resolveStore.js's isStoreLive checks this).
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [vendor] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "vendor"))).limit(1);
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  if (!vendor.nin) {
    return NextResponse.json({ error: "This vendor hasn't submitted a NIN yet" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(reviewVendorApprovalSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { decision, reviewNote } = result.data;

  const [updated] = await db
    .update(users)
    .set({
      approvalStatus: decision,
      approvalReviewedBy: user.id,
      approvalReviewNote: reviewNote || null,
      approvalReviewedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  sendPushToUser(id, {
    title: decision === "approved" ? "You're verified!" : "Verification update",
    body:
      decision === "approved"
        ? "Your identity has been verified - your store is now live and can take orders."
        : reviewNote || "Your NIN submission was rejected. Check your verification page for details.",
    url: "/vendor/verification",
  }).catch((err) => console.error("sendPushToUser failed (vendor verification decision):", err));

  await logActivity({
    user,
    action: decision === "approved" ? "vendor.approve" : "vendor.reject",
    targetType: "vendor",
    targetId: id,
    metadata: { reviewNote: reviewNote || null },
  });

  const { passwordHash: _, nin: __, ...safeVendor } = updated;
  return NextResponse.json({ vendor: safeVendor });
}
