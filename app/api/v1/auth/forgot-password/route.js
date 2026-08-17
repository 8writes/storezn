import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, staff, customers, tokens } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, forgotPasswordSchema } from "../../../../../lib/validate.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { isPlatformHost, resolveStoreByHost } from "../../../../../lib/resolveStore.js";

export async function POST(req) {
  const limit = checkRateLimit(req, "forgot-password", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(forgotPasswordSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { email } = result.data;

  const host = req.headers.get("host") || "";

  // Which table(s) to search depends on the host, same as login (see
  // isPlatformHost) - a store subdomain only ever means "this store's
  // customer", never the platform's own users/staff.
  let account = null;
  let tokenCols = null;
  if (isPlatformHost(host)) {
    const [vendorOrAdmin] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (vendorOrAdmin) {
      account = vendorOrAdmin;
      tokenCols = { userId: vendorOrAdmin.id };
    } else {
      const [staffRow] = await db.select().from(staff).where(eq(staff.email, email)).limit(1);
      if (staffRow) {
        account = staffRow;
        tokenCols = { staffId: staffRow.id };
      }
    }
  } else {
    const store = await resolveStoreByHost(host);
    if (store) {
      const [customerRow] = await db.select().from(customers).where(and(eq(customers.storeId, store.id), eq(customers.email, email))).limit(1);
      if (customerRow) {
        account = customerRow;
        tokenCols = { customerId: customerRow.id };
      }
    }
  }

  // Always return ok regardless of whether the email matches an account -
  // don't leak which emails are registered.
  if (account) {
    const token = crypto.randomUUID();
    await db.insert(tokens).values({
      ...tokenCols,
      type: "reset",
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Built from the request's own host, not a fixed root domain - a
    // customer requesting this from their store's subdomain must land
    // back on that store's own /reset-password (app/storefront/[host]/...,
    // rewritten by proxy.js), not the vendor/admin one at the platform
    // root, and vice versa for a vendor/admin request.
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;
    // Not awaited - the response below must stay fast regardless of mail
    // provider latency, and always-ok must not depend on send success
    // (see the comment above). Wrapped in after() rather than left as a
    // bare fire-and-forget promise: Vercel can freeze/tear down a
    // serverless invocation the instant the response is sent, which can
    // silently cut an un-awaited async call off mid-flight - after()
    // (backed by Vercel's waitUntil) keeps the invocation alive until
    // this callback actually settles.
    after(() =>
      sendMail({
        to: account.email,
        subject: "Reset your password",
        html: `<p>A password reset was requested for your account.</p><p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">Reset Password</a></p>`,
      }).catch((err) => console.error("sendMail failed (forgot-password):", err)),
    );
  }

  return NextResponse.json({ ok: true });
}
