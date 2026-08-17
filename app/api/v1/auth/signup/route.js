import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { customers } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { validate, customerSignupSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { sendVerificationEmail } from "../../../../../lib/emailVerification.js";

// Customer self-signup, scoped to whichever store's storefront the
// request came from (via Host). Uniqueness is per (storeId, email) - see
// customers.email in lib/db/schema.js - not platform-wide, so the same
// email can independently sign up as a customer at more than one store.
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

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.storeId, store.id), eq(customers.email, email)))
    .limit(1);
  if (existing) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(customers)
    .values({
      storeId: store.id,
      firstName,
      lastName,
      email,
      passwordHash,
      emailVerified: false,
      termsAcceptedAt: new Date(),
    })
    .returning();

  after(() =>
    sendVerificationEmail({ user: created, req, kind: "customer" }).catch((err) => console.error("sendVerificationEmail failed (signup):", err)),
  );

  const { passwordHash: _, ...safeUser } = created;
  return NextResponse.json({ user: { ...safeUser, role: "customer" } }, { status: 201 });
}
