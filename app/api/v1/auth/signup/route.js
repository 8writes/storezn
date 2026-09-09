import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { customers, blockedEmails } from "../../../../../lib/db/schema.js";
import { and, eq, or } from "drizzle-orm";
import { validate, customerSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";
import { normalizeEmail, emailDomain, isEmailBlocked } from "../../../../../lib/emailNormalize.js";
import { sendPushToRole } from "../../../../../lib/push.js";

// Customer self-signup, scoped to whichever store's storefront the
// request came from (via Host). Uniqueness is per (storeId, email) AND
// per (storeId, normalizedEmail) - see customers in lib/db/schema.js -
// so one mailbox can't farm accounts with foo+1@ / foo+2@ / etc.
export async function POST(req) {
  const limit = checkRateLimit(req, "customer-signup", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
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

  // Super-admin block-list (spam-account farming).
  const blockRows = await db
    .select({ value: blockedEmails.value, kind: blockedEmails.kind })
    .from(blockedEmails)
    .where(or(and(eq(blockedEmails.kind, "email"), eq(blockedEmails.value, normalized)), and(eq(blockedEmails.kind, "domain"), eq(blockedEmails.value, domain))));
  if (isEmailBlocked(email, blockRows)) {
    return NextResponse.json({ error: "This email address can't be used to sign up." }, { status: 403 });
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
        termsAcceptedAt: new Date(),
      })
      .returning();
  } catch (err) {
    // Lost a race with a simultaneous signup for the same mailbox.
    if (/unique|duplicate key/i.test(err.message || "")) {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
    throw err;
  }

  after(() => {
    sendVerificationEmail({ user: created, req, kind: "customer" }).catch((e) => console.error("sendVerificationEmail failed (signup):", e));
    // Platform team gets pinged on every new customer so a spam wave can
    // be caught early (see the block-list above / super-admin settings).
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
