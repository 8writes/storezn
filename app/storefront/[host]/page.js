import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { products, categories } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";
import { StorefrontFilters } from "@/components/storefront/StorefrontFilters.js";

const SORTS = {
  newest: desc(products.createdAt),
  price_asc: asc(products.price),
  price_desc: desc(products.price),
};

export default async function StorefrontHomePage({ params, searchParams }) {
  const { host } = await params;
  const sp = await searchParams;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return null;

  const q = sp.q?.trim();
  const categoryId = sp.category;
  const minPrice = sp.min ? Number(sp.min) : null;
  const maxPrice = sp.max ? Number(sp.max) : null;
  const sort = SORTS[sp.sort] ? sp.sort : "newest";

  const conditions = [eq(products.storeId, store.id), eq(products.isActive, true), isNull(products.suspendedAt)];
  if (q) conditions.push(ilike(products.name, `%${q}%`));
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(gte(products.price, minPrice));
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(lte(products.price, maxPrice));

  const [items, categoryList] = await Promise.all([
    db.select().from(products).where(and(...conditions)).orderBy(SORTS[sort]),
    db.select().from(categories).where(eq(categories.storeId, store.id)).orderBy(categories.name),
  ]);

  return (
    <div className="space-y-10">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">{store.name}</h1>
        <p className="text-sm text-slate-500 uppercase tracking-widest">All products</p>
      </div>

      <StorefrontFilters categories={categoryList} />

      {items.length === 0 ? (
        <p className="text-center text-slate-700 py-24">{q || categoryId || minPrice || maxPrice ? "No products match your filters." : "No products yet, check back soon."}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {items.map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} className="group block">
              <div className="aspect-square bg-slate-100 overflow-hidden">
                {p.images?.[0] ? (
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-slate-300 text-xs">No image</span>
                )}
              </div>
              <div className="mt-3 space-y-0.5">
                <p className="text-sm text-slate-800 group-hover:text-slate-950 transition-colors">
                  {p.name}
                  {p.productType === "physical" && p.condition !== "new" && (
                    <span className="ml-1.5 text-xs text-slate-700 uppercase tracking-wide">{formatCondition(p.condition)}</span>
                  )}
                </p>
                <p className="text-sm font-medium text-slate-900">{formatCurrency(p.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
