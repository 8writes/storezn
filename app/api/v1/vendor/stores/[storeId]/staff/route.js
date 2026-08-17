import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, staff as staffTable, tokens, platformSettings, branches } from "../../../../../../../lib/db/schema.js";
import { and, count, eq, sql } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { validate, inviteStaffSchema } from "../../../../../../../lib/validate.js";
import { sendMail } from "../../../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../../../lib/email/escapeHtml.js";
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
// run the store, but doesn't get to invite or remove other staff (they
// can leave it themselves though, see DELETE /api/v1/vendor/staff/me).
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
  const staffList = await db
    .select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      email: staffTable.email,
      createdAt: staffTable.createdAt,
      branchId: staffTable.branchId,
      branchName: branches.name,
      activatedAt: sql`(select min(${tokens.usedAt}) from ${tokens} where ${tokens.staffId} = ${staffTable.id} and ${tokens.type} = 'reset' and ${tokens.usedAt} is not null)`,
    })
    .from(staffTable)
    .leftJoin(branches, eq(staffTable.branchId, branches.id))
    .where(eq(staffTable.storeId, storeId))
    .orderBy(staffTable.createdAt);

  const storeBranches = await db.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  const settings = await loadSettings();
  return NextResponse.json({ staff: staffList, max: getStaffLimit(store, settings), branches: storeBranches });
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
  const [{ activeCount }] = await db.select({ activeCount: count() }).from(staffTable).where(eq(staffTable.storeId, storeId));
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
  const { firstName, lastName, email, branchId } = result.data;

  // Unique per (storeId, email), not platform-wide (see staff.email in
  // lib/db/schema.js) - this same email can already be a customer
  // somewhere, a vendor, or staff at a different store, all independently.
  const [existingStaff] = await db.select({ id: staffTable.id }).from(staffTable).where(and(eq(staffTable.storeId, storeId), eq(staffTable.email, email))).limit(1);
  if (existingStaff) {
    return NextResponse.json({ error: "That email is already a staff member here" }, { status: 409 });
  }

  // A single-branch store has nothing to pick - auto-assign the one
  // branch. A multi-branch store requires the vendor to choose.
  const storeBranches = await db.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  let resolvedBranchId = null;
  if (storeBranches.length === 1) {
    resolvedBranchId = storeBranches[0].id;
  } else if (storeBranches.length > 1) {
    if (!branchId) return NextResponse.json({ error: "Choose which branch this staff member belongs to" }, { status: 400 });
    if (!storeBranches.some((b) => b.id === branchId)) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    resolvedBranchId = branchId;
  }

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);

  const [newStaff] = await db
    .insert(staffTable)
    .values({
      storeId,
      branchId: resolvedBranchId,
      firstName,
      lastName,
      email,
      passwordHash,
      // They're being invited by someone who already knows their email is
      // real - no separate email-verification round needed on top of the
      // reset-password link below, which already proves inbox control.
      emailVerified: true,
    })
    .returning();

  const token = crypto.randomUUID();
  await db.insert(tokens).values({
    staffId: newStaff.id,
    type: "reset",
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "";
  const setPasswordUrl = `${protocol}://${host}/reset-password?token=${token}`;

  after(() =>
    sendMail({
      to: newStaff.email,
      subject: `You've been added to ${store.name} on Storezn`,
      html: `<p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(user.firstName) || "The team"} added you as staff on <strong>${escapeHtml(store.name)}</strong>'s Storezn dashboard.</p><p>Set your password to get started. This link expires in 7 days.</p><p><a href="${setPasswordUrl}">Set your password</a></p>`,
      fromName: store.name,
    }).catch((err) => console.error("sendMail failed (staff invite):", err)),
  );

  const { passwordHash: _, ...safeStaff } = newStaff;
  return NextResponse.json({ staff: { ...safeStaff, role: "staff" } }, { status: 201 });
}
