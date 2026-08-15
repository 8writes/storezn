import Link from "next/link";
import {
  Store,
  Wallet,
  Truck,
  LayoutDashboard,
  Percent,
  ArrowRight,
  ShoppingBag,
  TrendingUp,
  Package,
  Check,
  MapPin,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { getLiveStores } from "@/lib/liveStores.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

const COMPARISON = [
  { feature: "Getting started", storezn: "Live store in minutes, no code" },
  { feature: "Getting paid", storezn: "Automatic payouts straight to your bank" },
  { feature: "Platform fees", storezn: "You choose who pays it - you or your customer" },
  { feature: "Buyer trust", storezn: "Every vendor identity-verified (NIN)" },
  { feature: "Adding your catalog", storezn: "Bulk upload with a CSV template" },
];

const PERKS = [
  { icon: Store, title: "Your own store", text: "Live in minutes, with a custom domain if you want one." },
  { icon: Wallet, title: "Direct payouts", text: "Sales settle straight to your bank account, automatically." },
  { icon: Truck, title: "Shipping, your way", text: "Set rates by state or city, or one flat rate for everything." },
  { icon: LayoutDashboard, title: "A dashboard that stays out of your way", text: "Orders, customers, and products - no clutter." },
  { icon: Percent, title: "You choose who pays the fee", text: "Absorb it yourself, or pass it to your customers at checkout." },
  { icon: Package, title: "Bulk product upload", text: "Import your whole catalog at once with a CSV template, no adding items one by one." },
];

const STEPS = [
  { n: "01", title: "Create your store", text: "Pick a name, add your first products, done in minutes." },
  { n: "02", title: "Get verified", text: "Confirm your identity with your NIN so customers can trust your store." },
  { n: "03", title: "Start sharing & selling", text: "Share your link, take orders, get paid straight to your bank." },
];

export const revalidate = 300;

export default async function Home() {
  const { list: featuredStores } = await getLiveStores({ page: 1, pageSize: 6 });

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      {/* Hero - layered depth: floating stat cards at staggered z/rotation
          behind and around the headline, standing in for a real product
          screenshot we don't have yet without fabricating one. */}
      <section className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-28 sm:pb-40">
        <div
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background: "radial-gradient(60% 50% at 50% 0%, var(--color-brand-50), transparent)",
          }}
        />
        <div className="max-w-3xl mx-auto text-center relative">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Easy Business Management
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto">
            Manage products, orders, shipping, and payouts from one dashboard, so you can spend less time on admin
            and more time running your business.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white px-6 py-3 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer shadow-lg shadow-brand-600/20"
            >
              Create your free store
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center text-sm font-semibold text-slate-700 border border-slate-200 px-6 py-3 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              See pricing
            </Link>
          </div>
        </div>

        {/* Floating cards - purely decorative depth cues, no fabricated
            data (dummy round numbers, not claimed as real stats). */}
        <div className="hidden md:block max-w-3xl mx-auto relative h-0">
          <div className="absolute -top-2 -left-6 lg:-left-24 w-52 bg-white rounded-sm border border-slate-100 shadow-xl shadow-slate-900/10 p-4 -rotate-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <TrendingUp size={14} className="text-brand-600" />
              Payout
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">Sent to your bank</p>
            <p className="text-xs text-slate-400">Automatically, per sale</p>
          </div>
          <div className="absolute top-16 -right-4 lg:-right-28 w-48 bg-white rounded-sm border border-slate-100 shadow-xl shadow-slate-900/10 p-4 rotate-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <ShoppingBag size={14} className="text-brand-600" />
              Order
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">New sale</p>
            <p className="text-xs text-slate-400">Paid &amp; confirmed</p>
          </div>
          <div className="absolute top-40 left-1/2 -translate-x-1/2 lg:-translate-x-[130%] w-44 bg-white rounded-sm border border-slate-100 shadow-lg shadow-slate-900/10 p-3.5 rotate-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Package size={14} className="text-brand-600" />
              Stock
            </div>
            <p className="mt-1 text-sm font-bold text-slate-900">Synced live</p>
          </div>
        </div>
      </section>

      {/* Perks - layered cards with soft shadow + hover lift */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <div className="text-center max-w-lg mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Everything to run a real store</h2>
          <p className="mt-3 text-slate-500">No plugins to install, no theme to fight with.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PERKS.map(({ title, text }) => (
            <div
              key={title}
              className="bg-white border border-slate-100 rounded-sm p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Storezn? */}
      <section className="bg-slate-50/60 border-y border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center max-w-lg mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Why Storezn?</h2>
            <p className="mt-3 text-slate-500">Built for people running a business, not fighting their platform.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
            {COMPARISON.map((row) => (
              <div key={row.feature} className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.feature}</p>
                  <p className="text-sm text-slate-500">{row.storezn}</p>
                </div>
                <Check size={16} className="shrink-0 mt-0.5 text-brand-600" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works - numbered, an actual sequence */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <div className="text-center max-w-lg mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Three steps to your first sale</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, text }) => (
            <div key={n} className="relative bg-white border border-slate-100 rounded-sm p-6 shadow-sm">
              <span className="text-3xl font-extrabold text-brand-100">{n}</span>
              <p className="mt-2 font-semibold text-slate-900">{title}</p>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Discover Businesses - a teaser for /stores, doubles as social proof
          once there are real stores to show. Hidden entirely rather than
          rendered empty when there aren't any yet. */}
      {featuredStores.length > 0 && (
        <section className="bg-slate-50/60 border-y border-slate-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Discover Businesses</h2>
                <p className="mt-2 text-slate-500">Real businesses already selling on Storezn.</p>
              </div>
              <Link href="/stores" className="text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1.5 shrink-0">
                See all stores
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuredStores.map((store) => (
                <a
                  key={store.id}
                  href={getStorefrontUrl(store)}
                  target="_blank"
                  rel="noreferrer"
                  className="group bg-white border border-slate-100 rounded-sm overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="h-24 bg-slate-50 flex items-center justify-center border-b border-slate-100 px-6">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.name} className="max-h-12 max-w-full object-contain" />
                    ) : (
                      <span className="flex items-center justify-center h-10 w-10 rounded-full bg-brand-600 text-white text-sm font-bold">
                        {store.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                      {store.name}
                      <ArrowRight size={13} className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                    </p>
                    {store.description ? (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{store.description}</p>
                    ) : store.address ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                        <MapPin size={11} className="shrink-0" />
                        <span className="line-clamp-1">{store.address}</span>
                      </p>
                    ) : null}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing teaser */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Free to start. Upgrade when you outgrow it.</h2>
        <p className="mt-3 text-slate-500 max-w-md mx-auto">
          Every store gets the essentials for free. Storezn+ adds offline order recording, a custom storefront color, and
          more staff seats and storage.
        </p>
        <Link
          href="/pricing"
          className="mt-7 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 border border-brand-200 bg-brand-50 px-6 py-3 rounded-sm hover:bg-brand-100 transition-colors cursor-pointer"
        >
          Storezn Plus
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-900 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(50% 80% at 80% 20%, var(--color-brand-700), transparent)" }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Your store is a few minutes away</h2>
          <Link
            href="/signup"
            className="mt-7 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-white text-brand-900 px-6 py-3 rounded-sm hover:bg-brand-50 transition-colors cursor-pointer"
          >
            Create your free store
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer's own mt-10 would otherwise show a gap of the page's white
          background between it and the CTA band above, which is the same
          dark brand-900 - cancel it out so the two dark sections sit flush. */}
      <div className="-mt-10">
        <Footer />
      </div>
    </div>
  );
}
