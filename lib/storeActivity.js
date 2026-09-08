import { db } from "./db/index.js";
import { storeActivityLogs } from "./db/schema.js";

// Records an important store action for the owner's audit trail
// (GET /api/v1/vendor/stores/[storeId]/activity, /vendor/activity page).
// Call it fire-and-forget - wrap in `after()` at the call site, same as
// sendMail/logActivity - so a logging failure never blocks the response.
//
//   actor:   the getUser() result (vendor or staff)
//   action:  a dotted key, e.g. "pos.sale", "pos.return", "register.close",
//            "cash.paid_out", "stock.adjust", "product.price", "staff.add"
//   summary: one human-readable line ("Rang up ₦4,500 · 3 items")
export async function logStoreActivity({
  storeId,
  actor,
  branchId = null,
  action,
  summary,
  targetType = null,
  targetId = null,
  metadata = null,
}) {
  if (!storeId || !actor || !action) return;
  try {
    await db.insert(storeActivityLogs).values({
      storeId,
      actorId: actor.id || null,
      actorName: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email || "Unknown",
      actorRole: actor.role === "staff" ? "staff" : "vendor",
      branchId: branchId || actor.branchId || null,
      action,
      summary,
      targetType,
      targetId,
      metadata,
    });
  } catch (err) {
    console.error("logStoreActivity failed:", err);
  }
}

export function actorLabel(actor) {
  return `${actor?.firstName || ""} ${actor?.lastName || ""}`.trim() || actor?.email || "Someone";
}
