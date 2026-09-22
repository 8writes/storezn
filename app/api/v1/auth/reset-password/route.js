import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users, staff, customers, tokens, stores } from "../../../../../lib/db/schema.js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { validate, resetPasswordSchema } from "../../../../../lib/validate.js";
import { sendPushToUser } from "../../../../../lib/push.js";

export async function POST(req) {
  const limit = await checkRateLimit(req, "reset-password", { max: 10, windowMs: 60_000 });
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

  // Exactly one of these is set on the token row (see
  // tokens.userId/staffId/customerId in lib/db/schema.js).
  const isStaff = !!tokenRow.staffId;
  const [table, id] = tokenRow.customerId ? [customers, tokenRow.customerId] : isStaff ? [staff, tokenRow.staffId] : [users, tokenRow.userId];

  const passwordHash = await bcrypt.hash(password, 10);
  const [updatedAccount] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(table).set({ passwordHash }).where(eq(table.id, id)).returning();
    await tx.update(tokens).set({ usedAt: new Date() }).where(eq(tokens.id, tokenRow.id));
    return [updated];
  });

  // This is also how a staff invite gets "accepted" - the token above is
  // the exact one emailed at invite time (see POST .../staff), so setting
  // a password here doubles as activation. Let the vendor know their
  // staff member is actually in, not just invited.
  if (isStaff) {
    const [store] = await db.select({ ownerId: stores.ownerId, name: stores.name }).from(stores).where(eq(stores.id, updatedAccount.storeId)).limit(1);
    if (store?.ownerId) {
      sendPushToUser(store.ownerId, {
        title: "Staff member active",
        body: `${updatedAccount.firstName} ${updatedAccount.lastName} accepted your invite and can now access ${store.name}.`,
        url: "/vendor/staff",
      }).catch((err) => console.error("sendPushToUser failed (staff activated):", err));
    }
  }

  return NextResponse.json({ ok: true });
}
