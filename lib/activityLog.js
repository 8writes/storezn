import { db } from "./db/index.js";
import { activityLogs } from "./db/schema.js";

// Only admin/p_staff actions are logged - super_admin already has
// unrestricted access, so logging their own actions wouldn't add any
// accountability. Call this fire-and-forget (wrap in `after()` at the
// call site, same pattern as sendMail) so a logging failure never blocks
// the response.
//
// `always` overrides that exclusion for actions where the record matters
// regardless of who took it - reading a vendor's decrypted NIN is the
// case this exists for: it is access to a government identity document,
// and "a super_admin can do anything anyway" is not a reason to have no
// record of whose account read whose NIN and when.
export async function logActivity({ user, action, targetType = null, targetId = null, metadata = null, always = false }) {
  if (!user || (!always && user.role === "super_admin")) return;
  await db.insert(activityLogs).values({
    actorId: user.id,
    actorName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    actorRole: user.role,
    action,
    targetType,
    targetId,
    metadata,
  });
}
