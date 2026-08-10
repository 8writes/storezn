import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users, tokens } from "../../../../../lib/db/schema.js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, resetPasswordSchema } from "../../../../../lib/validate.js";

export async function POST(req) {
  const limit = checkRateLimit(req, "reset-password", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(resetPasswordSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { token, password } = result.data;

  const [tokenRow] = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.token, token), eq(tokens.type, "reset"), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())))
    .limit(1);
  if (!tokenRow) {
    return NextResponse.json({ error: "This reset link is invalid or has expired" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, tokenRow.userId));
    await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, tokenRow.id));
  });

  return NextResponse.json({ ok: true });
}
