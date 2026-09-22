import { NextResponse } from "next/server";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { getStorefrontProducts } from "../../../../../lib/storefrontProducts.js";

const PAGE_SIZE = 24;

// Backs "Load more" and filter changes on a store's own home page (see
// app/storefront/[host]/page.js's client-side StorefrontProductGrid) -
// the page itself still server-renders page 1 for SEO/first-paint, this
// is hit for page 2+ and whenever a filter changes after that.
export async function GET(req) {
  const store = await resolveStoreByHost(req.headers.get("host") || "");
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = Math.min(1_000, Math.max(1, parseInt(searchParams.get("page"), 10) || 1));
  const q = searchParams.get("q") || undefined;
  const categoryId = searchParams.get("category") || undefined;
  const minPrice = searchParams.get("min") ? Number(searchParams.get("min")) : null;
  const maxPrice = searchParams.get("max") ? Number(searchParams.get("max")) : null;
  const sort = searchParams.get("sort") || "newest";
  const discountedOnly = searchParams.get("discounted") === "1";

  const { list, total } = await getStorefrontProducts({ storeId: store.id, page, pageSize: PAGE_SIZE, q, categoryId, minPrice, maxPrice, sort, discountedOnly });
  return NextResponse.json({ products: list, total });
}
