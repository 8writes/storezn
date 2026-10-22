import { NextResponse } from "next/server";
import { runPlanReminders } from "../../../../lib/planReminders.js";

// Daily: plan "ending soon" / "ended" notices to store owners, and alerts
// to the team about hand-granted plans (lib/planReminders.js). Same secret
// as the other cron routes; a missing secret fails closed.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runPlanReminders());
}
