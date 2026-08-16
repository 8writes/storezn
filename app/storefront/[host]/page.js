import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { products, categories } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { StorefrontFilters } from "@/components/storefront/StorefrontFilters.js";

// What a shopper actually pays - filtering/sorting by price should match
// what's shown and charged, not the pre-discount `price` column. See
// lib/pricing.js's getEffectivePrice for the same math applied in JS.
const EFFECTIVE_PRICE = sql`(${products.price} * (1 - coalesce(${products.discountPercent}, 0) / 100.0))`;

const SORTS = {
  newest: desc(products.createdAt),
  price_asc: asc(EFFECTIVE_PRICE),
  price_desc: desc(EFFECTIVE_PRICE),
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
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(gte(EFFECTIVE_PRICE, minPrice));
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(lte(EFFECTIVE_PRICE, maxPrice));

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
          {items.map((p) => {
            const effectivePrice = getEffectivePrice(p.price, p.discountPercent);
            return (
              <Link key={p.id} href={`/products/${p.slug}`} className="group block">
                <div className="relative aspect-4/5 bg-slate-100 overflow-hidden">
                  {p.discountPercent > 0 && (
                    <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-sm">
                      -{p.discountPercent}%
                    </span>
                  )}
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
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-sm font-medium text-slate-900">{formatCurrency(effectivePrice)}</span>
                    {p.discountPercent > 0 && (
                      <span className="text-xs text-slate-400 line-through">{formatCurrency(p.price)}</span>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
