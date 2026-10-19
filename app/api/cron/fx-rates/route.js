import { NextResponse } from "next/server";
import { refreshExchangeRates } from "../../../../lib/fxRates.js";

// Hourly: refresh the USD->NGN display rates from every provider (see
// lib/fxRates.js). Display only - nothing is charged at these figures.
// Same protection as the other cron routes: an external scheduler must
// send the secret, and a missing secret fails closed rather than matching
// "Bearer undefined".
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await refreshExchangeRates();
  return NextResponse.json({ results });
}
