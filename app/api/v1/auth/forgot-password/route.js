import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, tokens } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, forgotPasswordSchema } from "../../../../../lib/validate.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";

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

  // Always return ok regardless of whether the email matches an account -
  // don't leak which emails are registered.
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const token = crypto.randomUUID();
    await db.insert(tokens).values({
      userId: user.id,
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
    const host = req.headers.get("host") || "";
    const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;
    sendMail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>A password reset was requested for your account.</p><p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">Reset Password</a></p>`,
    }).catch((err) => console.error("sendMail failed (forgot-password):", err));
  }

  return NextResponse.json({ ok: true });
}
