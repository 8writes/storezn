import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users, staff, customers, tokens } from "../../../../../lib/db/schema.js";
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

  // Exactly one of these is set on the token row (see
  // tokens.userId/staffId/customerId in lib/db/schema.js) - staff rows
  // are already emailVerified:true at invite time so this branch is
  // effectively customer/vendor-only in practice, kept generic anyway.
  const [table, id] = row.customerId ? [customers, row.customerId] : row.staffId ? [staff, row.staffId] : [users, row.userId];

  await db.transaction(async (tx) => {
    await tx.update(table).set({ emailVerified: true }).where(eq(table.id, id));
    await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, row.id));
  });

  return NextResponse.json({ ok: true });
}
