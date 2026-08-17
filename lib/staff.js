import { db } from "./db/index.js";
import { staff, tokens, pushSubscriptions } from "./db/schema.js";
import { eq } from "drizzle-orm";

// Shared by the owner-initiated removal (DELETE .../staff/[staffId]) and
// self-leave (DELETE /api/v1/vendor/staff/me) - a real DELETE of the
// staff row (not a soft-delete, see the FK-owning routes' own comments)
// needs its dependent tokens/push_subscriptions rows cleared first, since
// neither FK cascades on delete.
export async function removeStaffMember(staffId) {
  await db.transaction(async (tx) => {
    await tx.delete(tokens).where(eq(tokens.staffId, staffId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.staffId, staffId));
    await tx.delete(staff).where(eq(staff.id, staffId));
  });
}
