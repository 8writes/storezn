import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { platformSettings } from "../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, updatePlatformSettingsSchema } from "../../../../../lib/validate.js";
import { createPlan, updatePlan } from "../../../../../lib/paystack.js";

async function getOrCreateSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettings).values({ id: "singleton" }).returning();
  return created;
}

function getDatabaseAccess() {
  const pgAdminUrl = process.env.PGADMIN_URL || "";
  const databaseUrl = process.env.DATABASE_URL || "";
  try {
    const url = new URL(databaseUrl);
    return {
      pgAdminUrl,
      configured: !!pgAdminUrl,
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      username: url.username || null,
    };
  } catch {
    return { pgAdminUrl, configured: !!pgAdminUrl, host: null, port: null, database: null, username: null };
  }
}

export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings, databaseAccess: getDatabaseAccess() });
}

export async function PATCH(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"]))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(updatePlatformSettingsSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const current = await getOrCreateSettings();

  // Keep the Storezn+ Paystack Plan's price in sync with this single
  // source of truth - create it once (first time a price is saved),
  // update its amount on every price change after that. Best-effort: a
  // Paystack outage shouldn't block saving the rest of the settings.
  const data = { ...result.data };
  if ("plusMonthlyPrice" in data) {
    try {
      if (!current.paystackPlanCode) {
        const { planCode } = await createPlan({ name: "Storezn+", amount: data.plusMonthlyPrice });
        data.paystackPlanCode = planCode;
      } else {
        await updatePlan(current.paystackPlanCode, { amount: data.plusMonthlyPrice });
      }
    } catch (err) {
      console.error("Failed to sync Storezn+ Paystack plan:", err);
    }
  }

  const [updated] = await db
    .update(platformSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(platformSettings.id, "singleton"))
    .returning();

  return NextResponse.json({ settings: updated });
}
