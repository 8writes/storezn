import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { users } from "../../../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../../lib/auth.js";
import { decryptNin } from "../../../../../../../lib/nin.js";

// Decrypts one vendor's NIN on demand - the vendor list never returns it
// (see /api/v1/super-admin/vendors), only whether one exists. Called
// only when an admin explicitly clicks "reveal" on a specific vendor, so
// the plaintext exists only in that one response and that admin's
// browser, never at rest.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  console.log(`NIN revealed: admin=${user.id} vendor=${id} at=${new Date().toISOString()}`);

  return NextResponse.json({ nin });
}
