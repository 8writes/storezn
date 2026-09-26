import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { stores, users, branches, blockedEmails } from "../../../../../lib/db/schema.js";
import { and, eq, or } from "drizzle-orm";
import { validate, vendorSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";
import { sendPushToRole } from "../../../../../lib/push.js";
import { normalizeEmail, emailDomain, isEmailBlocked } from "../../../../../lib/emailNormalize.js";
import { readDevice } from "../../../../../lib/device.js";
import {
  countRecentSignups,
  isDeviceBanned,
  logAbuseEvent,
  maybeAutoBanFromAbuse,
  VENDOR_SIGNUP_DEVICE_MAX,
  VENDOR_SIGNUP_IP_MAX,
} from "../../../../../lib/deviceBan.js";
import { recordDeviceUse } from "../../../../../lib/deviceLog.js";

// Public self-signup for vendors: anyone can create their own store and
// vendor account, no super_admin involved. Same store+vendor transaction
// shape as /api/v1/super-admin/stores, but callable without auth, and
// requires accepting the terms of service (which the vendor themselves
// is actually clicking here, unlike the admin-initiated path).
export async function POST(req) {
  const limit = await checkRateLimit(req, "vendor-signup", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const device = readDevice(req);
  if (await isDeviceBanned(device)) {
    await logAbuseEvent({ ...device, kind: "banned_device" });
    return NextResponse.json({ error: "Access from this device has been restricted.", banned: true }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(vendorSignupSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { vendor, acceptTerms, acceptMarketing, ...storeData } = result.data;
  const normalizedVendorEmail = normalizeEmail(vendor.email);

  const [existingStore] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, storeData.slug)).limit(1);
  if (existingStore) {
    return NextResponse.json({ error: "That store slug is already in use" }, { status: 409 });
  }

  const blockRows = await db
    .select({ value: blockedEmails.value, kind: blockedEmails.kind })
    .from(blockedEmails)
    .where(
      or(
        and(eq(blockedEmails.kind, "email"), eq(blockedEmails.value, normalizedVendorEmail)),
        and(eq(blockedEmails.kind, "domain"), eq(blockedEmails.value, emailDomain(vendor.email))),
      ),
    );
  // Repeatedly probing the block-list is the deliberate-abuse signal, so
  // it's logged and can auto-ban the device, exactly as on the customer
  // signup route - this path previously did neither.
  if (isEmailBlocked(vendor.email, blockRows)) {
    await logAbuseEvent({ ...device, normalizedEmail: normalizedVendorEmail, kind: "blocked_email" });
    if (await maybeAutoBanFromAbuse({ ...device, subjectEmail: vendor.email })) {
      return NextResponse.json({ error: "Access from this device has been restricted.", banned: true }, { status: 403 });
    }
    return NextResponse.json({ error: "This email address can't be used to sign up." }, { status: 403 });
  }

  // Signup flood from one device / one network. Soft caps, not an auto
  // device ban - see VENDOR_SIGNUP_DEVICE_MAX in lib/deviceBan.js for why
  // the vendor path is treated more leniently than the shopper path.
  // Each vendor signup creates a user, a store and a branch, so leaving
  // this path with only a rate limit in front of it made it the cheapest
  // way to farm rows on the platform.
  const [deviceSignups, ipSignups] = await Promise.all([
    countRecentSignups(users, users.signupDeviceId, device.deviceId),
    device.ip && device.ip !== "unknown" ? countRecentSignups(users, users.signupIp, device.ip) : Promise.resolve(0),
  ]);
  if (deviceSignups >= VENDOR_SIGNUP_DEVICE_MAX) {
    await logAbuseEvent({ ...device, normalizedEmail: normalizedVendorEmail, kind: "signup_flood" });
    return NextResponse.json({ error: "Too many stores have been created from this device recently. Please try again later." }, { status: 429 });
  }
  if (ipSignups >= VENDOR_SIGNUP_IP_MAX) {
    await logAbuseEvent({ ...device, normalizedEmail: normalizedVendorEmail, kind: "ip_flood" });
    return NextResponse.json({ error: "Too many stores have been created from this network recently. Please try again later." }, { status: 429 });
  }

  // Matched on the normalized form as well as the literal one, so one
  // mailbox can't become several vendor accounts through Gmail dot
  // aliases (signupEmail already rejects +tags). See
  // lib/emailNormalize.js and users.normalizedEmail.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, vendor.email), eq(users.normalizedEmail, normalizedVendorEmail)))
    .limit(1);
  if (existingUser) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(vendor.password, 10);

  let created;
  try {
    created = await db.transaction(async (tx) => {
      const [vendorUser] = await tx
        .insert(users)
        .values({
          firstName: vendor.firstName,
          lastName: vendor.lastName,
          email: vendor.email,
          normalizedEmail: normalizedVendorEmail,
          passwordHash,
          role: "vendor",
          emailVerified: false,
          marketingOptIn: !!acceptMarketing,
          signupDeviceId: device.deviceId,
          signupIp: device.ip,
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
      // Every store needs at least one branch for reservation to resolve
      // against (see resolveFulfillingBranch in lib/inventory.js) - this
      // is the one every single-location vendor never has to think about.
      await tx.insert(branches).values({ storeId: store.id, name: store.name, isDefault: true });
      return { store, vendorUser };
    });
  } catch (err) {
    // The slug/email pre-checks above are not atomic - two simultaneous
    // signups can both pass them. The unique indexes are what actually
    // decide it, so turn the loser's violation into the same 409 the
    // pre-check would have given instead of a 500.
    if (/unique|duplicate key/i.test(err.message || "")) {
      return NextResponse.json({ error: "That store name or email is already in use" }, { status: 409 });
    }
    throw err;
  }

  // Wrapped in after() rather than left as a bare fire-and-forget promise
  // - see the identical comment in forgot-password/route.js.
  after(() => {
    recordDeviceUse({ req, device, accountType: "user", accountId: created.vendorUser.id, email: created.vendorUser.email });
    sendVerificationEmail({ user: created.vendorUser, req }).catch((err) => console.error("sendVerificationEmail failed (vendor signup):", err));
    sendPushToRole("super_admin", {
      title: "New vendor signup",
      body: `${created.vendorUser.firstName} ${created.vendorUser.lastName} signed up "${created.store.name}" - pending verification.`,
      url: "/super-admin/stores",
    }).catch((err) => console.error("sendPushToRole failed (vendor signup):", err));
  });

  const { passwordHash: _, ...safeVendor } = created.vendorUser;
  return NextResponse.json({ store: created.store, vendor: safeVendor }, { status: 201 });
}
