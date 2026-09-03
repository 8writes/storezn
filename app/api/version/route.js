import { NextResponse } from "next/server";

// The build id of the currently deployed code. NEXT_PUBLIC_BUILD_ID is
// inlined at build time (see next.config.mjs), so this always reflects
// the live deploy - a stale tab compares its own baked-in id against
// this to know an update shipped. Never cached (the service worker also
// passes /api/* straight through).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "cache-control": "no-store, must-revalidate" } },
  );
}
