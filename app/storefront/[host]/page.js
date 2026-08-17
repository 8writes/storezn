import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { categories } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { getStorefrontProducts } from "@/lib/storefrontProducts.js";
import { StorefrontFilters } from "@/components/storefront/StorefrontFilters.js";
import { StorefrontProductGrid } from "@/components/storefront/StorefrontProductGrid.js";

const PAGE_SIZE = 24;

export default async function StorefrontHomePage({ params, searchParams }) {
  const { host } = await params;
  const sp = await searchParams;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return null;

  const q = sp.q?.trim() || undefined;
  const categoryId = sp.category || undefined;
  const minPrice = sp.min ? Number(sp.min) : null;
  const maxPrice = sp.max ? Number(sp.max) : null;
  const sort = sp.sort || "newest";

  const [{ list, total }, categoryList] = await Promise.all([
    getStorefrontProducts({ storeId: store.id, page: 1, pageSize: PAGE_SIZE, q, categoryId, minPrice, maxPrice, sort }),
    db.select().from(categories).where(eq(categories.storeId, store.id)).orderBy(categories.name),
  ]);

  return (
    <div className="space-y-10">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">{store.name}</h1>
        <p className="text-sm text-slate-500 uppercase tracking-widest">All products</p>
      </div>

      <StorefrontFilters categories={categoryList} />

      {list.length === 0 ? (
        <p className="text-center text-slate-700 py-24">{q || categoryId || minPrice || maxPrice ? "No products match your filters." : "No products yet, check back soon."}</p>
      ) : (
        <StorefrontProductGrid
          key={`${q || ""}-${categoryId || ""}-${sort}-${minPrice || ""}-${maxPrice || ""}`}
          initialProducts={list}
          total={total}
          filters={{ q: q || "", category: categoryId || "", sort, min: minPrice || "", max: maxPrice || "" }}
          storeState={store.state}
        />
      )}
    </div>
  );
}
