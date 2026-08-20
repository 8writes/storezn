import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { customers } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";
import { logActivity } from "../../../../../../lib/activityLog.js";

// Manual override for a customer stuck unverified because their
// verification email never actually arrived (deliverability issue,
// wrong SendPulse config, etc. - not something the customer did wrong).
// Only ever flips emailVerified on; there's no "unverify" here, unlike
// vendor approval - a verified email doesn't need to be revocable the
// way a vendor's identity approval does.
export async function PATCH(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [updated] = await db.update(customers).set({ emailVerified: true }).where(eq(customers.id, id)).returning();

  await logActivity({ user, action: "customer.verify_email", targetType: "customer", targetId: id });

  const { passwordHash: _, ...safeCustomer } = updated;
  return NextResponse.json({ customer: safeCustomer });
}
