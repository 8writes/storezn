import Link from "next/link";
import { Store as StoreIcon, MapPin, ArrowRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { getLiveStores } from "@/lib/liveStores.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

const PAGE_SIZE = 24;

// Public directory of live stores - a promotional page for the platform
// (visitors can browse and click straight into a real storefront) as much
// as it is a discovery tool for shoppers. Revalidated periodically rather
// than per-request since new stores/closures aren't that time-sensitive.
export const revalidate = 300;

export default async function StoresDirectoryPage({ searchParams }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const { list, total } = await getLiveStores({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      <main className="flex-1">
        <section className="relative px-4 sm:px-6 pt-16 sm:pt-20 pb-6 text-center">
          <div
            className="absolute inset-0 -z-10 opacity-60"
            style={{ background: "radial-gradient(60% 50% at 50% 0%, var(--color-brand-50), transparent)" }}
          />
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">Discover stores</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-500 max-w-md mx-auto">
            Real, verified businesses selling on Storezn. Browse a store and shop directly from it.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {list.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <StoreIcon size={28} className="mx-auto mb-3" />
              <p>No stores to show yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {list.map((store) => (
                <a
                  key={store.id}
                  href={getStorefrontUrl(store)}
                  target="_blank"
                  rel="noreferrer"
                  className="group bg-white border border-slate-100 rounded-sm overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="h-28 bg-slate-50 flex items-center justify-center border-b border-slate-100 px-6">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.name} className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span className="flex items-center justify-center h-12 w-12 rounded-full bg-brand-600 text-white text-lg font-bold">
                        {store.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      {store.name}
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                    </p>
                    {store.description ? (
                      <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{store.description}</p>
                    ) : (
                      <p className="mt-1.5 text-sm text-slate-400">Visit this store</p>
                    )}
                    {store.address && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin size={12} className="shrink-0" />
                        <span className="line-clamp-1">{store.address}</span>
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={`/stores?page=${page - 1}`} className="px-4 py-2 border border-slate-200 rounded-sm text-slate-700 hover:bg-slate-50">
                  Previous
                </Link>
              )}
              <span className="px-3 text-slate-400">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={`/stores?page=${page + 1}`} className="px-4 py-2 border border-slate-200 rounded-sm text-slate-700 hover:bg-slate-50">
                  Next
                </Link>
              )}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
