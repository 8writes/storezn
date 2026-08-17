import { NextResponse, after } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, customers } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, resendVerificationSchema } from "../../../../../lib/validate.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";
import { isPlatformHost, resolveStoreByHost } from "../../../../../lib/resolveStore.js";

// Staff accounts are always emailVerified:true from the moment they're
// invited (see POST .../staff) - never need this, so this route is
// effectively users (vendor/super_admin) on the platform host, or
// customers scoped to a store on that store's own host.
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

  const host = req.headers.get("host") || "";

  let account = null;
  let kind = "user";
  if (isPlatformHost(host)) {
    [account] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  } else {
    const store = await resolveStoreByHost(host);
    if (store) {
      [account] = await db.select().from(customers).where(and(eq(customers.storeId, store.id), eq(customers.email, email))).limit(1);
      kind = "customer";
    }
  }

  // Always return ok regardless of match/already-verified - don't leak
  // which emails are registered or their verification state, same
  // reasoning as forgot-password.
  if (account && !account.emailVerified) {
    // Wrapped in after() rather than left as a bare fire-and-forget
    // promise - see the identical comment in forgot-password/route.js.
    after(() =>
      sendVerificationEmail({ user: account, req, kind }).catch((err) => console.error("sendVerificationEmail failed (resend-verification):", err)),
    );
  }

  return NextResponse.json({ ok: true });
}
