import { NextResponse } from "next/server";
import { getMarketplaceProducts } from "../../../../../lib/marketplace.js";
import { parsePagination } from "../../../../../lib/pagination.js";

const PAGE_SIZE = 20;

// Backs "Load more" and filter changes on /marketplace (see
// app/marketplace/page.js's client-side MarketplaceGrid/MarketplaceFilters) -
// the page itself still server-renders page 1 for SEO/first-paint, this
// is hit for page 2+ and whenever a filter changes after that.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const { page, pageSize } = parsePagination(searchParams);
  const q = searchParams.get("q") || undefined;
  const categoryName = searchParams.get("category") || undefined;
  const minPrice = searchParams.get("min") ? Number(searchParams.get("min")) : null;
  const maxPrice = searchParams.get("max") ? Number(searchParams.get("max")) : null;
  const sort = searchParams.get("sort") || "newest";
  const effectivePageSize = Math.min(PAGE_SIZE, pageSize);
  const { list, total } = await getMarketplaceProducts({ page, pageSize: effectivePageSize, q, categoryName, minPrice, maxPrice, sort });
  return NextResponse.json({ products: list, total, pagination: { page, pageSize: effectivePageSize, totalPages: Math.max(1, Math.ceil(total / effectivePageSize)) } });
}
