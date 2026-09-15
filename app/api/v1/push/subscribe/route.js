import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { pushSubscriptions } from "../../../../../lib/db/schema.js";
import { and, eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { validate, pushSubscribeSchema } from "../../../../../lib/validate.js";

// Which pushSubscriptions column gets the signed-in principal's id -
// userId/staffId/customerId are mutually exclusive per row (see
// lib/db/schema.js's users/staff/customers split). Only ever called from
// the vendor/super_admin/staff dashboard today (see
// components/ui/PushNotificationToggle.js's call sites), but written to
// cover a customer-facing subscribe button too if that's ever added.
function columnForRole(role) {
  if (role === "staff") return "staffId";
  if (role === "customer") return "customerId";
  return "userId";
}

// Called once per browser/device after the client gets permission and
// calls PushManager.subscribe() - see components/ui/PushNotificationToggle.js.
// onConflictDoUpdate on endpoint: the same browser re-subscribing (e.g.
// after clearing site data) or a subscription moving to a different
// logged-in user on a shared device both just overwrite the existing row
// rather than erroring on the unique constraint.
export async function POST(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(pushSubscribeSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { endpoint, keys } = result.data;

  const column = columnForRole(user.role);
  const ownerValues = { userId: null, staffId: null, customerId: null, [column]: user.id };

  await db
    .insert(pushSubscriptions)
    .values({ ...ownerValues, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ...ownerValues, p256dh: keys.p256dh, auth: keys.auth },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  const column = pushSubscriptions[columnForRole(user.role)];
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(column, user.id)));
  return NextResponse.json({ ok: true });
}
