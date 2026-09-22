import { NextResponse } from "next/server";
import { cleanupStaleData } from "../../../../lib/cleanupStaleData.js";

// External server cron only. This endpoint never accepts a user session so a
// vendor or customer cannot trigger maintenance work with their own account.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupStaleData();
  return NextResponse.json({ ok: true, ...result });
}
