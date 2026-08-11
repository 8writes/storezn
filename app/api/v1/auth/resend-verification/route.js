import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, resendVerificationSchema } from "../../../../../lib/validate.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";

export async function POST(req) {
  const limit = checkRateLimit(req, "resend-verification", { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(resendVerificationSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { email } = result.data;

  // Always return ok regardless of match/already-verified - don't leak
  // which emails are registered or their verification state, same
  // reasoning as forgot-password.
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.emailVerified) {
    sendVerificationEmail({ user, req }).catch((err) => console.error("sendVerificationEmail failed (resend-verification):", err));
  }

  return NextResponse.json({ ok: true });
}
