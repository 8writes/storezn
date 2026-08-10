import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../../../../lib/db/index.js";
import { stores, users } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { validate, loginSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";

export async function POST(req) {
  const limit = checkRateLimit(req, "login", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(loginSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { email, password } = result.data;

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (user.isBanned) {
    return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (user.role === "customer" && user.storeId) {
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, user.storeId)).limit(1);
    if (store && !store.isActive) {
      return NextResponse.json({ error: "This store is currently unavailable." }, { status: 403 });
    }
  }
  if (user.role === "vendor") {
    const owned = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.ownerId, user.id));
    if (owned.length > 0 && owned.every((s) => !s.isActive)) {
      return NextResponse.json({ error: "Your store's account is currently disabled." }, { status: 403 });
    }
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const { passwordHash, ...safeUser } = user;

  return NextResponse.json({ token, user: safeUser });
}
