import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, staff, customers, tokens } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, forgotPasswordSchema } from "../../../../../lib/validate.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { isPlatformHost, resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { emailBrand, emailButton } from "../../../../../lib/email/templates.js";
import { buildRequestUrl } from "../../../../../lib/requestUrl.js";

export async function POST(req) {
  const limit = await checkRateLimit(req, "forgot-password", { max: 5, windowMs: 60_000 });
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
  let mailBrand = null;
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
      mailBrand = store;
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
    // Scheme via lib/requestUrl.js rather than a raw x-forwarded-proto
    // read that defaulted to "http" - this link carries a live one-hour
    // reset token. The host is still the request's own (see above).
    const resetUrl = buildRequestUrl(req, `/reset-password?token=${token}`);
    const identity = emailBrand(mailBrand);
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
        html: `<h2>Reset your password</h2><p>We received a request to reset your password.</p><p>Use the secure button below within 1 hour. If you did not request this, you can ignore this email.</p>${emailButton(resetUrl, "Reset password", identity.accentColor)}`,
        brand: mailBrand,
        fromName: mailBrand?.name,
        preheader: "Use this secure link to reset your password",
      }).catch((err) => console.error("sendMail failed (forgot-password):", err)),
    );
  }

  return NextResponse.json({ ok: true });
}
