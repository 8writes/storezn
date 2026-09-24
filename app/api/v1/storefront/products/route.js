import { NextResponse } from "next/server";
import { resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { getStorefrontProducts } from "../../../../../lib/storefrontProducts.js";
import { parsePagination } from "../../../../../lib/pagination.js";

const PAGE_SIZE = 20;

// Backs "Load more" and filter changes on a store's own home page (see
// app/storefront/[host]/page.js's client-side StorefrontProductGrid) -
// the page itself still server-renders page 1 for SEO/first-paint, this
// is hit for page 2+ and whenever a filter changes after that.
export async function GET(req) {
  const store = await resolveStoreByHost(req.headers.get("host") || "");
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const { page, pageSize } = parsePagination(searchParams);
  const q = searchParams.get("q") || undefined;
  const categoryId = searchParams.get("category") || undefined;
  const minPrice = searchParams.get("min") ? Number(searchParams.get("min")) : null;
  const maxPrice = searchParams.get("max") ? Number(searchParams.get("max")) : null;
  const sort = searchParams.get("sort") || "newest";
  const discountedOnly = searchParams.get("discounted") === "1";

  const { list, total } = await getStorefrontProducts({ storeId: store.id, page, pageSize: Math.min(PAGE_SIZE, pageSize), q, categoryId, minPrice, maxPrice, sort, discountedOnly });
  return NextResponse.json({ products: list, total, pagination: { page, pageSize: Math.min(PAGE_SIZE, pageSize), totalPages: Math.max(1, Math.ceil(total / Math.min(PAGE_SIZE, pageSize))) } });
}
