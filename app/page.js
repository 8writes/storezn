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
  ClipboardList,
  Check,
  ShieldCheck,
  Lock,
  Landmark,
  ScanLine,
  Globe,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { Reveal } from "@/components/Reveal.jsx";
import { getMarketplaceProducts } from "@/lib/marketplace.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { formatCurrency } from "@/lib/format.js";

const PERKS = [
  { icon: Store, title: "Your own storefront", text: "A real online store on your own storezn.com address, live in minutes - no theme to fight, no code." },
  { icon: Wallet, title: "Payouts to your bank", text: "Every paid order is split at checkout and settled straight to your bank account. We never hold your money." },
  { icon: ScanLine, title: "A till for the counter", text: "Ring up walk-in customers on any phone or tablet - cash, transfer or POS machine, with change from the drawer." },
  { icon: Package, title: "Stock that stays honest", text: "Inventory moves the moment an order comes in - online or in person - so the number you see is the number you have." },
  { icon: TrendingUp, title: "Numbers you can act on", text: "Revenue, best sellers, low stock and expiring items - on the dashboard, not buried in a spreadsheet." },
  { icon: Truck, title: "Shipping, your rules", text: "Rates by state or city, or one flat fee for everything. Set it once and checkout does the maths." },
  { icon: Percent, title: "You choose who pays the fee", text: "Absorb the platform fee yourself, or pass it to the customer at checkout. Your call, per store." },
  { icon: ShoppingBag, title: "Bulk catalogue upload", text: "Import your whole range at once from a CSV template instead of adding items one by one." },
  { icon: LayoutDashboard, title: "One calm dashboard", text: "Orders, customers, products, payouts and staff - in one place, without the clutter." },
];

const CHANNELS = [
  { icon: Globe, title: "Your storefront", text: "Share one link on WhatsApp, Instagram, anywhere - customers browse and buy." },
  { icon: ShoppingBag, title: "The marketplace", text: "Get discovered by shoppers browsing across every store on Storezn." },
  { icon: ScanLine, title: "In person", text: "Sell at the counter or a pop-up on the built-in point-of-sale." },
  { icon: MessageCircle, title: "Phone & WhatsApp", text: "Log an order taken off-platform so stock and takings still line up." },
];

const TICKER = [
  "Online storefront",
  "Shared marketplace",
  "In-person POS",
  "WhatsApp & phone orders",
  "Custom domain",
  "Automatic bank payouts",
  "Multi-branch stock",
  "Staff logins & roles",
  "Bulk CSV import",
  "Sales analytics",
];

const STEPS = [
  { n: "01", title: "Create your store", text: "Pick a name, add your first products. Minutes, not days." },
  { n: "02", title: "Verify your identity", text: "Confirm who you are with your NIN so customers know there's a real business behind the store." },
  { n: "03", title: "Share and get paid", text: "Send your link, take orders online and in person, money lands in your bank." },
];

export const revalidate = 300;

export default async function Home() {
  const { list: featuredProducts } = await getMarketplaceProducts({ page: 1, pageSize: 3 });

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 55% at 50% 0%, var(--color-brand-50), transparent 70%)" }}
        />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          <Reveal className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <Sparkles size={13} />
              Built for Nigerian retail
            </span>
            <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.05] text-slate-900">
              Everything you need to sell online and in person
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto lg:mx-0">
              Your own store, a shared marketplace, a point-of-sale for the counter, and automatic payouts to your bank
              &mdash; run from one clean dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white px-6 py-3.5 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer shadow-lg shadow-brand-600/25"
              >
                Create your free store
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center text-sm font-semibold text-slate-700 border border-slate-200 px-6 py-3.5 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Free forever plan &middot; No card required &middot; Payouts straight to your bank
            </p>
          </Reveal>

          {/* Product frame - a UI mock, not a stats claim: browser chrome over
              a compact dashboard preview built from plain elements. */}
          <Reveal delay={120} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="rounded-md border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="ml-2 flex-1 truncate rounded-sm bg-white border border-slate-200 px-2.5 py-1 text-[11px] text-slate-400">
                  yourstore.storezn.com
                </span>
              </div>
              <div className="p-4 sm:p-5 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-sm border border-slate-100 bg-white p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Revenue this week</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">₦248,500</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-700">
                      <TrendingUp size={11} /> Settled to your bank
                    </p>
                  </div>
                  <div className="rounded-sm border border-slate-100 bg-white p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Orders</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">17</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">3 in progress</p>
                  </div>
                </div>
                <div className="rounded-sm border border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: "New order · online", meta: "Paid" },
                    { label: "Counter sale · POS", meta: "Cash" },
                    { label: "Stock updated", meta: "Synced" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                        {row.label}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">{row.meta}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="hidden sm:flex absolute -bottom-5 -left-5 items-center gap-2.5 rounded-sm border border-slate-100 bg-white px-3.5 py-3 shadow-xl shadow-slate-900/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
                <Wallet size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Payout sent</p>
                <p className="text-[11px] text-slate-400">Straight to your bank</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- Ways to sell ticker */}
      <div className="border-y border-slate-100 bg-slate-50/70 py-3.5 overflow-hidden">
        <div className="flex w-max animate-marquee gap-8 pr-8">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-xs font-medium text-slate-400 whitespace-nowrap">
              <Check size={13} className="text-brand-500" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------------- Trust strip */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Lock size={14} className="text-slate-400" />
            Card payments handled by Paystack
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={14} className="text-slate-400" />
            Every vendor NIN-verified
          </span>
          <span className="inline-flex items-center gap-2">
            <Landmark size={14} className="text-slate-400" />
            Payouts settle to your own bank
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------- Feature grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <Reveal className="text-center max-w-xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Everything to run a real store</h2>
          <p className="mt-3 text-slate-500">Not a page builder with a shop bolted on. The whole operation.</p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PERKS.map(({ icon: Icon, title, text }, i) => (
            <Reveal
              key={title}
              delay={(i % 3) * 80}
              className="group bg-white border border-slate-100 rounded-sm p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <Icon size={20} />
              </span>
              <p className="mt-4 font-semibold text-slate-900">{title}</p>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- Sell everywhere, one place */}
      <section className="bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Sell everywhere. Track it in one place.</h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              A sale is a sale, whether it came from your link, the marketplace, the till at your shop, or a WhatsApp
              message. Every one of them pulls the same stock down and lands in the same order history &mdash; so your
              numbers are never split across four places.
            </p>
            <Link
              href="/help"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See how it works
              <ArrowRight size={15} />
            </Link>
          </Reveal>
          <div className="space-y-3">
            {CHANNELS.map(({ icon: Icon, title, text }, i) => (
              <Reveal
                key={title}
                delay={i * 70}
                className="flex items-start gap-4 bg-white border border-slate-100 rounded-sm p-5 shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand-50 text-brand-700">
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    {title}
                    <Check size={14} className="text-brand-500 shrink-0" />
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <Reveal className="text-center max-w-lg mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Three steps to your first sale</h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, text }, i) => (
            <Reveal
              key={n}
              delay={i * 90}
              className="relative bg-white border border-slate-100 rounded-sm p-6 shadow-sm"
            >
              <span className="font-display text-3xl font-extrabold text-brand-200">{n}</span>
              <p className="mt-2 font-semibold text-slate-900">{title}</p>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- Marketplace teaser */}
      {featuredProducts.length > 0 && (
        <section className="bg-slate-50/70 border-y border-slate-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <Reveal className="flex items-end justify-between gap-4 mb-8 flex-wrap">
              <div>
                <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Shop the Marketplace</h2>
                <p className="mt-2 text-slate-500">Real products from real businesses already selling on Storezn.</p>
              </div>
              <Link href="/marketplace" className="text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1.5 shrink-0">
                See the marketplace
                <ArrowRight size={15} />
              </Link>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {featuredProducts.map((product, i) => {
                const effectivePrice = getEffectivePrice(product.price, product.discountPercent);
                return (
                  <Reveal key={product.id} delay={i * 80}>
                    <a
                      href={`${getStorefrontUrl(product.store)}/products/${product.slug}?from=marketplace`}
                      className="group block bg-white border border-slate-100 rounded-sm overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="aspect-square bg-slate-50 border-b border-slate-100">
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-slate-300 text-xs">No image</span>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 truncate">{product.store.name}</p>
                        <p className="mt-0.5 font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          <span className="truncate">{product.name}</span>
                          <ArrowRight size={13} className="shrink-0 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(effectivePrice)}</p>
                      </div>
                    </a>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------- Pricing teaser */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center w-full">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Free to start. Upgrade when you outgrow it.</h2>
          <p className="mt-3 text-slate-500 max-w-lg mx-auto leading-relaxed">
            Every store gets the essentials free. <span className="font-medium text-slate-700">Storezn+</span> adds
            offline order recording, a custom domain, storefront colour, and more staff seats and storage.{" "}
            <span className="font-medium text-slate-700">Enterprise</span> adds the full point-of-sale system, set up
            with you by our team.
          </p>
          <Link
            href="/pricing"
            className="mt-7 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 border border-brand-200 bg-brand-50 px-6 py-3 rounded-sm hover:bg-brand-100 transition-colors cursor-pointer"
          >
            Compare all plans
            <ArrowRight size={16} />
          </Link>
        </Reveal>
      </section>

      {/* ----------------------------------------------------------------- Final CTA */}
      <section className="bg-brand-900 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(50% 80% at 80% 20%, var(--color-brand-700), transparent)" }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-white">Your store is a few minutes away</h2>
            <p className="mt-3 text-white/70">Set it up now. Add your first product before your coffee&apos;s cold.</p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-white text-brand-900 px-6 py-3.5 rounded-sm hover:bg-brand-50 transition-colors cursor-pointer"
            >
              Create your free store
              <ArrowRight size={16} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Footer's own mt-10 would otherwise show a strip of the page's white
          background between it and the dark CTA band above - cancel it. */}
      <div className="-mt-10">
        <Footer />
      </div>
    </div>
  );
}
