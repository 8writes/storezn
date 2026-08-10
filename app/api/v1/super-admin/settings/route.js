import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { platformSettings } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, updatePlatformSettingsSchema } from "../../../../../lib/validate.js";

async function getOrCreateSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettings).values({ id: "singleton" }).returning();
  return created;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updatePlatformSettingsSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await getOrCreateSettings();
  const [updated] = await db
    .update(platformSettings)
    .set({
      defaultCommissionRatePercent: result.data.defaultCommissionRatePercent,
      maxCommissionAmount: result.data.maxCommissionAmount,
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.id, "singleton"))
    .returning();

  return NextResponse.json({ settings: updated });
}
