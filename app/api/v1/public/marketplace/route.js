import { NextResponse } from "next/server";
import { getMarketplaceProducts } from "../../../../../lib/marketplace.js";

const PAGE_SIZE = 24;

// Backs "Load more" and filter changes on /stores (see
// app/stores/page.js's client-side MarketplaceGrid/MarketplaceFilters) -
// the page itself still server-renders page 1 for SEO/first-paint, this
// is hit for page 2+ and whenever a filter changes after that.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  const q = searchParams.get("q") || undefined;
  const categoryName = searchParams.get("category") || undefined;
  const minPrice = searchParams.get("min") ? Number(searchParams.get("min")) : null;
  const maxPrice = searchParams.get("max") ? Number(searchParams.get("max")) : null;
  const sort = searchParams.get("sort") || "newest";
  const { list, total } = await getMarketplaceProducts({ page, pageSize: PAGE_SIZE, q, categoryName, minPrice, maxPrice, sort });
  return NextResponse.json({ products: list, total });
}
