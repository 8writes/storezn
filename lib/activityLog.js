import { db } from "./db/index.js";
import { activityLogs } from "./db/schema.js";

// Only admin/p_staff actions are logged - super_admin already has
// unrestricted access, so logging their own actions wouldn't add any
// accountability. Call this fire-and-forget (wrap in `after()` at the
// call site, same pattern as sendMail) so a logging failure never blocks
// the response.
export async function logActivity({ user, action, targetType = null, targetId = null, metadata = null }) {
  if (!user || user.role === "super_admin") return;
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
