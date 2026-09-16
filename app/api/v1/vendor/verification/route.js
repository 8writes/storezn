import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, submitNinSchema } from "../../../../../lib/validate.js";
import { sendPushToRole, sendPushToUser } from "../../../../../lib/push.js";
import { decryptNin } from "../../../../../lib/nin.js";
import { verifyNinWithVerifyGuru } from "../../../../../lib/verifyGuru.js";

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

  // Decrypted only transiently, to check it's actually a real 11-digit
  // NIN and not garbage from a broken client - the plaintext is never
  // logged or stored, only the ciphertext the vendor sent (result.data.nin)
  // is persisted below, same as everywhere else NIN is at rest.
  let plainNin;
  try {
    plainNin = decryptNin(result.data.nin);
  } catch {
    return NextResponse.json({ error: "Could not process NIN - please try again" }, { status: 400 });
  }
  if (!/^\d{11}$/.test(plainNin)) {
    return NextResponse.json({ error: "NIN must be exactly 11 digits" }, { status: 400 });
  }

  const autoVerification = await verifyNinWithVerifyGuru({
    nin: plainNin,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  const autoApproved = autoVerification.approved;

  const [updated] = await db
    .update(users)
    .set({
      nin: result.data.nin,
      ninSubmittedAt: new Date(),
      approvalStatus: autoApproved ? "approved" : "pending",
      approvalReviewNote: autoApproved ? "Auto-approved by VerifyGuru NIN verification." : null,
      approvalReviewedBy: null,
      approvalReviewedAt: autoApproved ? new Date() : null,
    })
    .where(eq(users.id, user.id))
    .returning();

  after(() => {
    if (autoApproved) {
      sendPushToUser(updated.id, {
        title: "You're verified!",
        body: "Your identity was verified automatically - your store is now live and can take orders.",
        url: "/vendor/verification",
      }).catch((err) => console.error("sendPushToUser failed (NIN auto-approval):", err));
      sendPushToRole("super_admin", {
        title: "Vendor auto-approved",
        body: `${updated.firstName} ${updated.lastName} was verified automatically by VerifyGuru.`,
        url: "/super-admin/vendors?status=approved",
      }).catch((err) => console.error("sendPushToRole failed (NIN auto-approval):", err));
      return;
    }

    if (autoVerification.attempted) {
      console.warn("VerifyGuru NIN auto-approval skipped:", autoVerification.reason);
    }
    sendPushToRole("super_admin", {
      title: "Vendor verification submitted",
      body: `${updated.firstName} ${updated.lastName} submitted their NIN for manual review.`,
      url: "/super-admin/vendors?status=pending",
    }).catch((err) => console.error("sendPushToRole failed (NIN submission):", err));
  });

  return NextResponse.json({
    approvalStatus: updated.approvalStatus,
    nin: updated.nin,
    ninSubmittedAt: updated.ninSubmittedAt,
    approvalReviewNote: updated.approvalReviewNote,
    autoVerified: autoApproved,
  });
}
