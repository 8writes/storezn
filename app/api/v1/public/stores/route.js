import { NextResponse } from "next/server";
import { getLiveStores } from "../../../../../lib/liveStores.js";

const PAGE_SIZE = 24;

// Backs the "Load more" button on /stores (see app/stores/page.js's
// client-side StoresGrid) - the page itself still server-renders page 1
// for SEO/first-paint, this is only hit for page 2+.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  const { list, total } = await getLiveStores({ page, pageSize: PAGE_SIZE });
  return NextResponse.json({ stores: list, total });
}
