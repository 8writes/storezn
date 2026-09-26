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
import { logStoreActivity } from "../../../../../../../lib/storeActivity.js";
import { emailBrand, emailButton } from "../../../../../../../lib/email/templates.js";
import { buildRequestUrl } from "../../../../../../../lib/requestUrl.js";

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
  const token = crypto.randomUUID();

  // The seat count above is a friendly pre-check; this is the one that
  // holds. Serializing invites per store (same advisory-lock pattern as
  // the storage quota in lib/storeUploads.js) stops two simultaneous
  // invites from both passing a count one short of the limit. The invite
  // token is created in the same transaction as the row it belongs to, so
  // a failure can't leave a staff member with no way to set a password.
  let newStaff;
  try {
    newStaff = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`staff-invite:${storeId}`}))`);
      const [{ total: liveCount }] = await tx.select({ total: count() }).from(staffTable).where(eq(staffTable.storeId, storeId));
      if (liveCount >= staffLimit) {
        const err = new Error(`You can have at most ${staffLimit} staff members${staffLimit <= 1 ? " on the free plan - upgrade to Storezn+ for more" : ""}`);
        err.code = "STAFF_LIMIT_REACHED";
        throw err;
      }
      const [row] = await tx
        .insert(staffTable)
        .values({
          storeId,
          branchId: resolvedBranchId,
          firstName,
          lastName,
          email,
          passwordHash,
          // They're being invited by someone who already knows their email
          // is real - no separate email-verification round needed on top
          // of the reset-password link below, which already proves inbox
          // control.
          emailVerified: true,
        })
        .returning();
      await tx.insert(tokens).values({
        staffId: row.id,
        type: "reset",
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      return row;
    });
  } catch (err) {
    if (err?.code === "STAFF_LIMIT_REACHED") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // uq_staff_store_email - the existence check above is not atomic.
    if (err?.code === "23505") {
      return NextResponse.json({ error: "That email is already a staff member here" }, { status: 409 });
    }
    throw err;
  }

  // Same reasoning as forgot-password: this is a 7-day password-setting
  // link, so the scheme comes from lib/requestUrl.js instead of a raw
  // header read that defaulted to plaintext http.
  const setPasswordUrl = buildRequestUrl(req, `/reset-password?token=${token}`);
  const mailIdentity = emailBrand(store);

  after(() =>
    sendMail({
      to: newStaff.email,
      subject: `You've been added to ${store.name} on Storezn`,
      html: `<h2>You&apos;re invited</h2><p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(user.firstName) || "The team"} added you as staff on <strong>${escapeHtml(store.name)}</strong>.</p><p>Set your password within 7 days to get started.</p>${emailButton(setPasswordUrl, "Set your password", mailIdentity.accentColor)}`,
      fromName: store.name,
      brand: store,
      preheader: `You have been invited to ${store.name}`,
    }).catch((err) => console.error("sendMail failed (staff invite):", err)),
  );

  after(() =>
    logStoreActivity({
      storeId,
      actor: user,
      action: "staff.add",
      summary: `Invited ${firstName} ${lastName} (${email}) as staff`,
      targetType: "staff",
      targetId: newStaff.id,
      metadata: { name: `${firstName} ${lastName}`.trim(), email, branchId: resolvedBranchId },
    }),
  );

  const { passwordHash: _, ...safeStaff } = newStaff;
  return NextResponse.json({ staff: { ...safeStaff, role: "staff" } }, { status: 201 });
}
