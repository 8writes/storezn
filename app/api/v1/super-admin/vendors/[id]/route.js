import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { stores, users } from "../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { validate, reviewVendorApprovalSchema } from "../../../../../../lib/validate.js";
import { sendPushToUser } from "../../../../../../lib/push.js";
import { logActivity } from "../../../../../../lib/activityLog.js";
import { deleteVendorAccount } from "../../../../../../lib/deleteVendor.js";

// Approves or rejects a vendor's submitted NIN - see users.approvalStatus
// in lib/db/schema.js. Approving is what actually lets their store go
// live (lib/resolveStore.js's isStoreLive checks this).
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [vendor] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "vendor"))).limit(1);
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  // Suspend / restore. Restoring also brings back stores the vendor took
  // offline themselves (disabledReason "owner"), so a vendor who
  // self-disabled from /profile is fully back in one action; suspending
  // takes their stores offline too.
  if (typeof body.isBanned === "boolean") {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isBanned: body.isBanned }).where(eq(users.id, id));
      if (body.isBanned) {
        await tx.update(stores).set({ isOpen: false, isActive: false, disabledReason: "owner" }).where(eq(stores.ownerId, id));
      } else {
        await tx
          .update(stores)
          .set({ isActive: true, disabledReason: null })
          .where(and(eq(stores.ownerId, id), eq(stores.disabledReason, "owner")));
      }
    });
    await logActivity({ user, action: body.isBanned ? "vendor.suspend" : "vendor.restore", targetType: "vendor", targetId: id });
    return NextResponse.json({ ok: true, isBanned: body.isBanned });
  }

  if (!vendor.nin) {
    return NextResponse.json({ error: "This vendor hasn't submitted a NIN yet" }, { status: 400 });
  }

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

// Permanent, irreversible account deletion - super_admin only. Removes
// the vendor, every store they own, and everything under it (see
// lib/deleteVendor.js), including product images from storage.
export async function DELETE(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [vendor] = await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.id, id), eq(users.role, "vendor"))).limit(1);
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  await logActivity({ user, action: "vendor.delete", targetType: "vendor", targetId: id, metadata: { email: vendor.email } });
  await deleteVendorAccount(id);

  return NextResponse.json({ ok: true });
}
