import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { validate, customerSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";

// Customer self-signup, scoped to whichever store's storefront the
// request came from (via Host) - mirrors vendor signup's public,
// no-auth-required shape, but ties the new account to a store instead of
// creating one.
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

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({ storeId: store.id, firstName, lastName, email, passwordHash, role: "customer", termsAcceptedAt: new Date() })
    .returning();

  sendVerificationEmail({ user: created, req }).catch(() => {});

  const { passwordHash: _, ...safeUser } = created;
  return NextResponse.json({ user: safeUser }, { status: 201 });
}
