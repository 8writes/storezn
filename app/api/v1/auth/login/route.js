import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../../../../lib/db/index.js";
import { stores, users, staff, customers } from "../../../../../lib/db/schema.js";
import { and, desc, eq } from "drizzle-orm";
import { validate, loginSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { isPlatformHost, resolveStoreByHost } from "../../../../../lib/resolveStore.js";

const INVALID = NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

// Shared by the dashboard login form (vendor/staff/super_admin) and the
// storefront's per-store login form - which table(s) get searched
// depends on which host the request came in on (see isPlatformHost),
// since staff/customer accounts no longer share one global-unique email
// with everything else (see lib/db/schema.js's users/staff/customers
// split). Vendor signup issues its own tokens directly; this is the only
// place staff/customer tokens get minted.
export async function POST(req) {
  const limit = checkRateLimit(req, "login", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(loginSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const email = result.data.email.toLowerCase();
  const { password } = result.data;

  const host = req.headers.get("host") || "";

  if (isPlatformHost(host)) {
    const [vendorOrAdmin] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let account = vendorOrAdmin;
    let kind = "user";

    if (!account) {
      // Same email can be staff at more than one store (see the staff
      // table's per-store-scoped uniqueness) - an email match here is
      // ambiguous in that rare case. No multi-account picker exists yet,
      // so the pragmatic call is the most recently added matching row.
      const staffMatches = await db.select().from(staff).where(eq(staff.email, email)).orderBy(desc(staff.createdAt)).limit(1);
      account = staffMatches[0];
      kind = "staff";
    }

    if (!account) return INVALID;
    if (account.isBanned) return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) return INVALID;
    if (!account.emailVerified) {
      return NextResponse.json({ error: "Please verify your email before signing in", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }

    if (kind === "staff") {
      const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, account.storeId)).limit(1);
      if (store && !store.isActive) {
        return NextResponse.json({ error: "This store is currently unavailable." }, { status: 403 });
      }
    } else {
      const owned = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.ownerId, account.id));
      if (owned.length > 0 && owned.every((s) => !s.isActive)) {
        return NextResponse.json({ error: "Your store's account is currently disabled." }, { status: 403 });
      }
    }

    const token = jwt.sign({ id: account.id, kind }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash, ...safeAccount } = account;
    return NextResponse.json({ token, user: { ...safeAccount, role: kind === "staff" ? "staff" : safeAccount.role } });
  }

  const store = await resolveStoreByHost(host);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [account] = await db.select().from(customers).where(and(eq(customers.storeId, store.id), eq(customers.email, email))).limit(1);
  if (!account) return INVALID;
  if (account.isBanned) return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) return INVALID;
  if (!account.emailVerified) {
    return NextResponse.json({ error: "Please verify your email before signing in", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
  }
  if (!store.isActive) {
    return NextResponse.json({ error: "This store is currently unavailable." }, { status: 403 });
  }

  const token = jwt.sign({ id: account.id, kind: "customer" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const { passwordHash, ...safeAccount } = account;
  return NextResponse.json({ token, user: { ...safeAccount, role: "customer" } });
}
