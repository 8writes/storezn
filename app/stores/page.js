import Link from "next/link";
import { Anton } from "next/font/google";
import { Store as StoreIcon, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { getLiveStores } from "@/lib/liveStores.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

const PAGE_SIZE = 24;

// Scoped to this page only - the rest of the marketing site (landing,
// pricing) stays on the calmer layered-depth look, this directory gets a
// bolder maximalist treatment instead (dense, high-contrast, sticker-style
// accents) since it's meant to feel like a lively marketplace, not a
// product pitch.
const anton = Anton({ subsets: ["latin"], weight: "400" });

const POP = "#ff7a1a";

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
            {total} live {total === 1 ? "store" : "stores"} right now
          </span>
          <h1 className={`${anton.className} mt-5 uppercase leading-[0.9] text-4xl sm:text-6xl text-slate-900`}>
            Discover Businesses
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-md mx-auto font-medium">
            Real, verified businesses selling on Storezn. Browse a store and shop directly from it.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {list.length === 0 ? (
            <div className="text-center py-16 text-slate-500 bg-white border-2 border-dashed border-slate-300">
              <StoreIcon size={28} className="mx-auto mb-3" />
              <p className="font-medium">No stores to show yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {list.map((store, i) => (
                <a
                  key={store.id}
                  href={getStorefrontUrl(store)}
                  target="_blank"
                  rel="noreferrer"
                  className={`group relative bg-white border-2 border-slate-900 overflow-hidden transition-transform hover:-translate-y-1 ${
                    i % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
                  }`}
                  style={{ boxShadow: "5px 5px 0 0 #0f1712" }}
                >
                  <div className="h-28 flex items-center justify-center border-b-2 border-slate-900 px-6 bg-brand-50">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.name} className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span
                        className={`${anton.className} flex items-center justify-center h-12 w-12 rounded-full text-white text-xl border-2 border-slate-900`}
                        style={{ backgroundColor: POP }}
                      >
                        {store.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      {store.name}
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                    </p>
                    {store.description ? (
                      <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{store.description}</p>
                    ) : (
                      <p className="mt-1.5 text-sm text-slate-400">Visit this store</p>
                    )}
                    {store.address && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
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
            <div className="mt-12 flex items-center justify-center gap-3 text-sm">
              {page > 1 && (
                <Link
                  href={`/stores?page=${page - 1}`}
                  className="px-4 py-2 bg-white border-2 border-slate-900 font-bold text-slate-900 hover:-translate-y-0.5 transition-transform"
                  style={{ boxShadow: "3px 3px 0 0 #0f1712" }}
                >
                  Previous
                </Link>
              )}
              <span className="px-3 font-medium text-slate-600">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/stores?page=${page + 1}`}
                  className="px-4 py-2 bg-white border-2 border-slate-900 font-bold text-slate-900 hover:-translate-y-0.5 transition-transform"
                  style={{ boxShadow: "3px 3px 0 0 #0f1712" }}
                >
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
