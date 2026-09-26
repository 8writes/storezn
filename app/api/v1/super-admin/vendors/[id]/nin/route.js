import { NextResponse, after } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { users } from "../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../../lib/auth.js";
import { decryptNin } from "../../../../../../../lib/nin.js";
import { logActivity } from "../../../../../../../lib/activityLog.js";
import { checkRateLimit } from "../../../../../../../lib/rateLimit.js";

// Decrypts one vendor's NIN on demand - the vendor list never returns it
// (see /api/v1/super-admin/vendors), only whether one exists. Called
// only when an admin explicitly clicks "reveal" on a specific vendor, so
// the plaintext exists only in that one response and that admin's
// browser, never at rest.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-account cap. Revealing a NIN is a deliberate one-off click on one
  // vendor, so a burst of them is either a mistake or someone harvesting
  // identity numbers; either way it should not be possible to walk the
  // whole vendor list unimpeded.
  const limit = await checkRateLimit(req, "nin-reveal", { max: 20, windowMs: 60 * 60_000, userId: user.id });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many NIN reveals. Please wait before viewing another." }, { status: 429 });
  }

  const { id } = await params;
  const [vendor] = await db.select({ nin: users.nin }).from(users).where(and(eq(users.id, id), eq(users.role, "vendor"))).limit(1);
  if (!vendor?.nin) return NextResponse.json({ error: "No NIN on file for this vendor" }, { status: 404 });

  let nin;
  try {
    nin = decryptNin(vendor.nin);
  } catch {
    // Submitted before this encrypted flow shipped, so it's still the
    // raw digits, not ciphertext - fall back to returning it as-is
    // instead of erroring on every pre-existing submission.
    if (/^\d{11}$/.test(vendor.nin)) {
      nin = vendor.nin;
    } else {
      return NextResponse.json({ error: "Failed to decrypt NIN" }, { status: 500 });
    }
  }

  // A durable audit row, not just a line in stdout that rotates away -
  // this is access to someone's government identity number, so who read
  // whose has to survive. Logged for super_admin too (see logActivity's
  // `always`), unlike ordinary platform-team actions.
  after(() =>
    logActivity({
      user,
      action: "vendor.nin.reveal",
      targetType: "vendor",
      targetId: id,
      always: true,
    }).catch((err) => console.error("logActivity failed (nin reveal):", err)),
  );

  return NextResponse.json({ nin });
}
