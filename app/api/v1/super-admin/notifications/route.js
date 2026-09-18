import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { users } from "../../../../../lib/db/schema.js";
import { and, eq, ilike, or } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, sendNotificationSchema } from "../../../../../lib/validate.js";
import { sendPushToUser, sendPushToUsers } from "../../../../../lib/push.js";
import { sendMail } from "../../../../../lib/email/sendMail.js";
import { emailText } from "../../../../../lib/email/templates.js";
import { logActivity } from "../../../../../lib/activityLog.js";

// Lightweight vendor picker for the composer - not the same paginated
// list as /api/v1/super-admin/vendors, this just needs enough to search
// and pick one recipient.
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const conditions = [eq(users.role, "vendor")];
  if (q) conditions.push(or(ilike(users.firstName, `%${q}%`), ilike(users.lastName, `%${q}%`), ilike(users.email, `%${q}%`)));

  const vendors = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(and(...conditions))
    .limit(200);

  return NextResponse.json({ vendors });
}

// Custom admin-composed notification to vendors, push and/or email,
// either a single vendor or every vendor at once. Bulk email is looped
// per-recipient - sendMail only supports a single "to" (see every other
// caller in the codebase), there's no batch-send path.
export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(sendNotificationSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { title, body: message, url, channel, target, userId } = result.data;

  const recipients =
    target === "single"
      ? await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
      : await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "vendor"));

  if (recipients.length === 0) return NextResponse.json({ error: "No matching vendor found" }, { status: 404 });

  let pushResult = { sent: 0, failed: 0 };
  if (channel === "push" || channel === "both") {
    pushResult =
      target === "single"
        ? await sendPushToUser(recipients[0].id, { title, body: message, url })
        : await sendPushToUsers(recipients.map((r) => r.id), { title, body: message, url });
  }

  let emailSent = 0;
  let emailFailed = 0;
  if (channel === "email" || channel === "both") {
    const results = await Promise.allSettled(
      recipients
        .filter((r) => r.email)
        .map((r) =>
          sendMail({
            to: r.email,
            subject: title,
            html: `<h2>${emailText(title)}</h2><p>${emailText(message)}</p>`,
            preheader: message,
          }),
        ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") emailSent++;
      else {
        emailFailed++;
        console.error("sendMail failed (super-admin notification):", r.reason);
      }
    }
  }

  await logActivity({
    user,
    action: "notification.broadcast",
    targetType: "vendor",
    targetId: target === "single" ? userId : null,
    metadata: { title, channel, target, recipients: recipients.length },
  });

  return NextResponse.json({
    recipients: recipients.length,
    push: pushResult,
    email: { sent: emailSent, failed: emailFailed },
  });
}
