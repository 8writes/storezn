import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, tokens } from "../../../../../lib/db/schema.js";
import { and, eq, isNull, gt } from "drizzle-orm";
import { validate, verifyEmailSchema } from "../../../../../lib/validate.js";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(verifyEmailSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { token } = result.data;

  const [row] = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.token, token), eq(tokens.type, "verify"), isNull(tokens.usedAt), gt(tokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return NextResponse.json({ error: "This verification link is invalid or has expired" }, { status: 400 });

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, row.userId));
    await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, row.id));
  });

  return NextResponse.json({ ok: true });
}
