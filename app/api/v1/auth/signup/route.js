import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { customers, blockedEmails } from "../../../../../lib/db/schema.js";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { validate, customerSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";
import { normalizeEmail, emailDomain, isEmailBlocked } from "../../../../../lib/emailNormalize.js";
import { sendPushToRole } from "../../../../../lib/push.js";
import { readDevice } from "../../../../../lib/device.js";
import { isDeviceBanned, banDevice, logAbuseEvent, maybeAutoBanFromAbuse, AUTO_BAN } from "../../../../../lib/deviceBan.js";

const BANNED = (extra) => NextResponse.json({ error: "Access from this device has been restricted.", banned: true, ...extra }, { status: 403 });

// Customer self-signup, scoped to whichever store's storefront the
// request came from (via Host). Guards: per-(store,email) + per-(store,
// normalizedEmail) uniqueness, the super-admin block-list, and a device
// ban / auto-ban for abuse (see lib/deviceBan.js + the privacy policy).
export async function POST(req) {
  const limit = checkRateLimit(req, "customer-signup", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const device = readDevice(req);

  // 1. Already-barred device.
  if (await isDeviceBanned(device)) {
    await logAbuseEvent({ ...device, kind: "banned_device" });
    return BANNED();
  }

  const host = req.headers.get("host") || "";
  const store = await resolveStoreByHost(host);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(customerSignupSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { firstName, lastName, email, password } = result.data;
  const normalized = normalizeEmail(email);
  const domain = emailDomain(email);

  // 2. Super-admin block-list. A device that keeps hitting it gets
  //    auto-banned once it crosses the abuse threshold.
  const blockRows = await db
    .select({ value: blockedEmails.value, kind: blockedEmails.kind })
    .from(blockedEmails)
    .where(or(and(eq(blockedEmails.kind, "email"), eq(blockedEmails.value, normalized)), and(eq(blockedEmails.kind, "domain"), eq(blockedEmails.value, domain))));
  if (isEmailBlocked(email, blockRows)) {
    await logAbuseEvent({ ...device, normalizedEmail: normalized, kind: "blocked_email" });
    if (await maybeAutoBanFromAbuse({ ...device, subjectEmail: email })) return BANNED();
    return NextResponse.json({ error: "This email address can't be used to sign up." }, { status: 403 });
  }

  const win = sql`now() - interval '${sql.raw(String(AUTO_BAN.WINDOW_HOURS))} hours'`;

  // 3. Signup flood from one device -> auto-ban that device.
  if (device.deviceId) {
    const [{ n }] = await db
      .select({ n: sql`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(eq(customers.signupDeviceId, device.deviceId), gt(customers.createdAt, win)));
    if (n >= AUTO_BAN.AUTO_BAN_SIGNUPS - 1) {
      await logAbuseEvent({ ...device, normalizedEmail: normalized, kind: "signup_flood" });
      await banDevice({ ...device, reason: `Auto: ${n + 1} accounts from one device in ${AUTO_BAN.WINDOW_HOURS}h`, autoFlagged: true, subjectEmail: email });
      return BANNED();
    }
  }

  // 4. Signup flood from one network. A script rotating x-device-id per
  //    request slips past the per-device check above; this catches it.
  //    A soft cap (no auto device ban - the device id can't be trusted
  //    here) sized to survive shared / CGNAT mobile IPs.
  if (device.ip && device.ip !== "unknown") {
    const [{ n }] = await db
      .select({ n: sql`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(eq(customers.signupIp, device.ip), gt(customers.createdAt, win)));
    if (n >= 8) {
      await logAbuseEvent({ ...device, normalizedEmail: normalized, kind: "ip_flood" });
      return NextResponse.json({ error: "Too many accounts have been created from this network recently. Please try again later." }, { status: 429 });
    }
  }

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.storeId, store.id), or(eq(customers.email, email), eq(customers.normalizedEmail, normalized))))
    .limit(1);
  if (existing) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  let created;
  try {
    [created] = await db
      .insert(customers)
      .values({
        storeId: store.id,
        firstName,
        lastName,
        email,
        normalizedEmail: normalized,
        passwordHash,
        emailVerified: false,
        signupDeviceId: device.deviceId,
        signupIp: device.ip,
        termsAcceptedAt: new Date(),
      })
      .returning();
  } catch (err) {
    if (/unique|duplicate key/i.test(err.message || "")) {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
    throw err;
  }

  after(() => {
    sendVerificationEmail({ user: created, req, kind: "customer" }).catch((e) => console.error("sendVerificationEmail failed (signup):", e));
    const notice = {
      title: "New customer signup",
      body: `${firstName} ${lastName} · ${email} · ${store.name}`,
      url: "/super-admin/customers",
    };
    sendPushToRole("super_admin", notice).catch((e) => console.error("sendPushToRole failed (signup, super_admin):", e));
    sendPushToRole("admin", notice).catch((e) => console.error("sendPushToRole failed (signup, admin):", e));
  });

  const { passwordHash: _, ...safeUser } = created;
  return NextResponse.json({ user: { ...safeUser, role: "customer" } }, { status: 201 });
}
