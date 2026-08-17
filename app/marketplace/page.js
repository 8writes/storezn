import { Anton } from "next/font/google";
import { Sparkles } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { MarketplaceFilters } from "@/components/MarketplaceFilters.js";
import { MarketplaceGrid } from "@/components/MarketplaceGrid.js";
import { getMarketplaceProducts, getMarketplaceCategoryNames } from "@/lib/marketplace.js";

const PAGE_SIZE = 24;

// Scoped to this page only - the rest of the marketing site (landing,
// pricing) stays on the calmer layered-depth look, this directory gets a
// bolder maximalist treatment instead (dense, high-contrast, sticker-style
// accents) since it's meant to feel like a lively marketplace, not a
// product pitch.
const anton = Anton({ subsets: ["latin"], weight: "400" });

const POP = "#ff7a1a";

// Public cross-store product marketplace (was previously a directory of
// stores - see git history for that version) - lists products from every
// store that's opted in (stores.listOnMarketplace, see
// lib/marketplace.js), searchable/sortable. Every product links straight
// out to its real storefront to buy - this page is discovery-only, never
// a shared cart/checkout (see MarketplaceGrid's ProductCard href and
// components/storefront/MarketplaceBanner.js on the receiving end).
//
// Only page 1 is server-rendered (for first-paint/SEO); filter changes
// and "Load more" beyond that are client-side (see MarketplaceFilters/
// MarketplaceGrid), backed by /api/v1/public/marketplace.
export const revalidate = 60;

export default async function MarketplacePage({ searchParams }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const categoryName = sp.category?.trim() || undefined;
  const minPrice = sp.min ? Number(sp.min) : null;
  const maxPrice = sp.max ? Number(sp.max) : null;
  const sort = sp.sort || "newest";

  const [{ list, total }, categoryNames] = await Promise.all([
    getMarketplaceProducts({ page: 1, pageSize: PAGE_SIZE, q, categoryName, minPrice, maxPrice, sort }),
    getMarketplaceCategoryNames(),
  ]);

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip" style={{ backgroundColor: "#fbf6e9" }}>
      <MarketingHeader />

      <main className="flex-1">
        <section
          className="relative px-4 sm:px-6 pt-14 sm:pt-20 pb-10 text-center border-b-4 border-slate-900 overflow-hidden"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(15,23,20,0.12) 1.5px, transparent 1.5px)",
            backgroundSize: "20px 20px",
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 border-2 border-slate-900 -rotate-2"
            style={{ backgroundColor: POP, color: "#1a0f00" }}
          >
            <Sparkles size={13} />
            {total} {total === 1 ? "product" : "products"} up for grabs
          </span>
          <h1 className={`${anton.className} mt-5 uppercase leading-[0.9] text-4xl sm:text-6xl text-slate-900`}>
            The Marketplace
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-md mx-auto font-medium">
            Products from real, verified businesses on Storezn. Find something you like, buy directly from that vendor&apos;s own store.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-6">
          <MarketplaceFilters categories={categoryNames} />
          {q && (
            <p className="text-sm text-slate-600">
              Showing results for &quot;<span className="font-semibold text-slate-900">{q}</span>&quot;
            </p>
          )}
          <MarketplaceGrid
            key={`${q || ""}-${categoryName || ""}-${sort}-${minPrice || ""}-${maxPrice || ""}`}
            initialProducts={list}
            total={total}
            filters={{ q: q || "", category: categoryName || "", sort, min: minPrice || "", max: maxPrice || "" }}
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
