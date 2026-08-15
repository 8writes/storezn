import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, users, tokens, platformSettings } from "../../../../../../../lib/db/schema.js";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { validate, inviteStaffSchema } from "../../../../../../../lib/validate.js";
import { sendMail } from "../../../../../../../lib/email/sendMail.js";
import { getStaffLimit } from "../../../../../../../lib/storePlan.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

async function loadSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  return row || { freeStaffLimit: 1, plusStaffLimit: 10 };
}

// Team management is owner-only, unlike most other store routes (see
// canManageStore vs isStoreOwner in lib/auth.js) - a staff member helps
// run the store, but doesn't get to invite or remove other staff.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // activatedAt: null until the staff member actually opens the invite
  // email and sets their password (POST /api/v1/auth/reset-password,
  // which stamps usedAt on the same "reset" token created at invite
  // time) - no separate status column needed, this token already is the
  // record of whether they've done that.
  const staff = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      createdAt: users.createdAt,
      activatedAt: sql`(select min(${tokens.usedAt}) from ${tokens} where ${tokens.userId} = ${users.id} and ${tokens.type} = 'reset' and ${tokens.usedAt} is not null)`,
    })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.role, "staff"), isNull(users.deletedAt)))
    .orderBy(users.createdAt);

  const settings = await loadSettings();
  return NextResponse.json({ staff, max: getStaffLimit(store, settings) });
}

// Invites work the same way as a password reset: create the account
// server-side with a password nobody knows, email a reset-password link
// (reusing the exact same token flow as /api/v1/auth/forgot-password) so
// the staff member's own first action is setting their own password -
// there's never a temporary one to leak or reuse.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await loadSettings();
  const staffLimit = getStaffLimit(store, settings);
  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.role, "staff"), isNull(users.deletedAt)));
  if (activeCount >= staffLimit) {
    return NextResponse.json(
      { error: `You can have at most ${staffLimit} staff members${staffLimit <= 1 ? " on the free plan - upgrade to Storezn+ for more" : ""}` },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(inviteStaffSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { firstName, lastName, email } = result.data;

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);

  const [staffUser] = await db
    .insert(users)
    .values({
      storeId,
      firstName,
      lastName,
      email,
      passwordHash,
      role: "staff",
      // They're being invited by someone who already knows their email is
      // real - no separate email-verification round needed on top of the
      // reset-password link below, which already proves inbox control.
      emailVerified: true,
    })
    .returning();

  const token = crypto.randomUUID();
  await db.insert(tokens).values({
    userId: staffUser.id,
    type: "reset",
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "";
  const setPasswordUrl = `${protocol}://${host}/reset-password?token=${token}`;

  after(() =>
    sendMail({
      to: staffUser.email,
      subject: `You've been added to ${store.name} on Storezn`,
      html: `<p>Hi ${firstName},</p><p>${user.firstName || "The team"} added you as staff on <strong>${store.name}</strong>'s Storezn dashboard.</p><p>Set your password to get started. This link expires in 7 days.</p><p><a href="${setPasswordUrl}">Set your password</a></p>`,
      fromName: store.name,
    }).catch((err) => console.error("sendMail failed (staff invite):", err)),
  );

  const { passwordHash: _, ...safeStaff } = staffUser;
  return NextResponse.json({ staff: safeStaff }, { status: 201 });
}
