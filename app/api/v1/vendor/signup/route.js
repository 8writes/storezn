import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { stores, users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { validate, vendorSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";

// Public self-signup for vendors: anyone can create their own store and
// vendor account, no super_admin involved. Same store+vendor transaction
// shape as /api/v1/super-admin/stores, but callable without auth, and
// requires accepting the terms of service (which the vendor themselves
// is actually clicking here, unlike the admin-initiated path).
export async function POST(req) {
  const limit = checkRateLimit(req, "vendor-signup", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(vendorSignupSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { vendor, acceptTerms, ...storeData } = result.data;

  const [existingStore] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, storeData.slug)).limit(1);
  if (existingStore) {
    return NextResponse.json({ error: "That store slug is already in use" }, { status: 409 });
  }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, vendor.email)).limit(1);
  if (existingUser) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(vendor.password, 10);

  const created = await db.transaction(async (tx) => {
    const [vendorUser] = await tx
      .insert(users)
      .values({
        firstName: vendor.firstName,
        lastName: vendor.lastName,
        email: vendor.email,
        passwordHash,
        role: "vendor",
        termsAcceptedAt: new Date(),
        // Every other role defaults to "approved" (see
        // users.approvalStatus in lib/db/schema.js) - a new vendor
        // signup is the one path that must start "pending", their store
        // stays unlisted until they submit a NIN and a super_admin
        // approves it (POST /api/v1/vendor/verification, see
        // lib/resolveStore.js's isStoreLive).
        approvalStatus: "pending",
      })
      .returning();
    const [store] = await tx.insert(stores).values({ ownerId: vendorUser.id, ...storeData }).returning();
    return { store, vendorUser };
  });

  sendVerificationEmail({ user: created.vendorUser, req }).catch(() => {});

  const { passwordHash: _, ...safeVendor } = created.vendorUser;
  return NextResponse.json({ store: created.store, vendor: safeVendor }, { status: 201 });
}
