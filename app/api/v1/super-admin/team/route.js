import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../lib/db/index.js";
import { users, tokens } from "../../../../../lib/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, inviteTeamMemberSchema } from "../../../../../lib/validate.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../lib/email/escapeHtml.js";
import { emailButton } from "../../../../../lib/email/templates.js";

// Team management (creating admin/p_staff accounts) is super_admin-only -
// letting `admin` do this too would let an admin staff the platform with
// allies, a privilege-escalation path. super_admin itself is never
// creatable here, only via scripts/seed-super-admin.mjs - it stays a
// deliberately out-of-band trust tier.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const team = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      isBanned: users.isBanned,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.role, ["admin", "p_staff"]))
    .orderBy(users.createdAt);

  return NextResponse.json({ team });
}

// Same invite-by-reset-link pattern as vendor staff invites (see
// /api/v1/vendor/stores/[storeId]/staff) - the account is created
// server-side with a password nobody knows, and the invitee's first
// action is setting their own password via the existing reset flow.
export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(inviteTeamMemberSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { firstName, lastName, email, role } = result.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "That email is already in use on the platform" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);

  const [newMember] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      emailVerified: true,
    })
    .returning();

  const token = crypto.randomUUID();
  await db.insert(tokens).values({
    userId: newMember.id,
    type: "reset",
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "";
  const setPasswordUrl = `${protocol}://${host}/reset-password?token=${token}`;

  after(() =>
    sendMail({
      to: newMember.email,
      subject: "You've been added to the Storezn team",
      html: `<h2>Welcome to the Storezn team</h2><p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(user.firstName) || "A super admin"} added you as ${role === "admin" ? "an admin" : "platform staff"}.</p><p>Set your password within 7 days to get started.</p>${emailButton(setPasswordUrl, "Set your password")}`,
      preheader: "Set your password to join the Storezn team",
    }).catch((err) => console.error("sendMail failed (team invite):", err)),
  );

  const { passwordHash: _, ...safeMember } = newMember;
  return NextResponse.json({ member: safeMember }, { status: 201 });
}
