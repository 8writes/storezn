import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { categories } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { isPlusStore } from "@/lib/storePlan.js";
import { getStorefrontProducts, getStorefrontRails } from "@/lib/storefrontProducts.js";
import { StorefrontFilters } from "@/components/storefront/StorefrontFilters.js";
import Link from "next/link";
import { StorefrontProductGrid } from "@/components/storefront/StorefrontProductGrid.js";
import { ProductRail } from "@/components/storefront/ProductRail.js";
import { StickyStoreSearch } from "@/components/storefront/StickyStoreSearch.js";

const PAGE_SIZE = 20;

export default async function StorefrontHomePage({ params, searchParams }) {
  const { host } = await params;
  const sp = await searchParams;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return null;

  // Same gate as the layout's header/footer theming - a Storezn+ store
  // with an accent colour set. The layout puts the brand-* CSS vars on
  // the storefront root, so text-brand-* here resolves to that colour.
  const themed = isPlusStore(store) && !!store.storefrontAccentColor;

  const q = sp.q?.trim() || undefined;
  const categoryId = sp.category || undefined;
  const minPrice = sp.min ? Number(sp.min) : null;
  const maxPrice = sp.max ? Number(sp.max) : null;
  const sort = sp.sort || "newest";
  const discountedOnly = sp.discounted === "1";

  // The featured / on-sale rails are a landing-page flourish - hidden the
  // moment the shopper is actually searching or filtering, when they want
  // the plain result grid, nothing else.
  const filtering = !!(q || categoryId || minPrice || maxPrice || discountedOnly);

  const [{ list, total }, categoryList, rails] = await Promise.all([
    getStorefrontProducts({ storeId: store.id, page: 1, pageSize: PAGE_SIZE, q, categoryId, minPrice, maxPrice, sort, discountedOnly }),
    db.select().from(categories).where(eq(categories.storeId, store.id)).orderBy(categories.name),
    filtering ? Promise.resolve({ featured: [], discounted: [] }) : getStorefrontRails({ storeId: store.id }),
  ]);

  const storeState = store.showShipsFrom === false ? null : store.state;

  // "Clear" next to the results line - drops the search term but keeps any
  // category / price / sort / on-sale filters the shopper still has set.
  const clearSearchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k !== "q" && v) clearSearchParams.set(k, String(v));
  }
  const clearSearchHref = clearSearchParams.toString() ? `?${clearSearchParams}` : "/";

  return (
    <>
      <StickyStoreSearch />
      <div className="space-y-10">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h1 className={`text-3xl sm:text-4xl font-semibold tracking-tight ${themed ? "text-brand-700" : "text-slate-900"}`}>{store.name}</h1>
          {store.showDescription !== false && store.description ? (
            <p className="text-sm text-slate-800 leading-relaxed line-clamp-2">{store.description}</p>
          ) : (
            <p className="text-sm text-slate-800 uppercase tracking-widest">All products</p>
          )}
        </div>

        {!filtering && rails.featured.length > 0 && (
          <ProductRail title="Featured" products={rails.featured} />
        )}
        {!filtering && rails.discounted.length > 0 && (
          <ProductRail title="On sale" products={rails.discounted} />
        )}

        <StorefrontFilters categories={categoryList} themed={themed} />

        {q && (
          <p className="text-sm text-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Showing {total} {total === 1 ? "result" : "results"} for{" "}
              <span className={`font-medium ${themed ? "text-brand-700" : "text-slate-900"}`}>&ldquo;{q}&rdquo;</span>
            </span>
            <Link href={clearSearchHref} className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2">
              Clear search
            </Link>
          </p>
        )}

        {list.length === 0 ? (
          <p className="text-center text-slate-700 py-24">{filtering ? "No products match your filters." : "No products yet, check back soon."}</p>
        ) : (
          <StorefrontProductGrid
            key={`${q || ""}-${categoryId || ""}-${sort}-${minPrice || ""}-${maxPrice || ""}-${discountedOnly ? "d" : ""}`}
            initialProducts={list}
            total={total}
            filters={{ q: q || "", category: categoryId || "", sort, min: minPrice || "", max: maxPrice || "", discounted: discountedOnly ? "1" : "" }}
            storeState={storeState}
          />
        )}
      </div>
    </>
  );
}
