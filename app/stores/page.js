import { Anton } from "next/font/google";
import { Sparkles } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { StoresGrid } from "@/components/StoresGrid.js";
import { getLiveStores } from "@/lib/liveStores.js";

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
// as it is a discovery tool for shoppers. Only page 1 is server-rendered
// (for first-paint/SEO) - "Load more" (see components/StoresGrid.js)
// fetches subsequent pages client-side from /api/v1/public/stores.
export const revalidate = 300;

export default async function StoresDirectoryPage() {
  const { list, total } = await getLiveStores({ page: 1, pageSize: PAGE_SIZE });

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
          <StoresGrid initialStores={list} total={total} />
        </section>
      </main>

      <Footer />
    </div>
  );
}
