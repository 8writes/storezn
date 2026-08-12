import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { pushSubscriptions } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../../lib/auth.js";
import { validate, pushSubscribeSchema } from "../../../../../lib/validate.js";

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

  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return NextResponse.json({ ok: true });
}
