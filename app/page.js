import Link from "next/link";
import Image from "next/image";
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
  ShieldCheck,
  Lock,
  Landmark,
  ScanLine,
  Globe,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { Reveal } from "@/components/Reveal.jsx";
import { getMarketplaceProducts } from "@/lib/marketplace.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { formatCurrency } from "@/lib/format.js";

const PERKS = [
  { icon: Store, title: "Your own website", text: "A website on your own storezn.com address, live in minutes - no theme to fight, no code." },
  { icon: Wallet, title: "Payouts to your bank", text: "Every paid order is split at checkout and settled straight to your bank account. We never hold your money." },
  { icon: ScanLine, title: "A till for the counter", text: "Ring up walk-in customers on any phone or tablet - cash, transfer or POS machine, with change from the drawer." },
  { icon: Package, title: "Stock that stays honest", text: "Inventory moves the moment an order comes in - online or in person - so the number you see is the number you have." },
  { icon: TrendingUp, title: "Numbers you can act on", text: "Revenue, best sellers, low stock and expiring items - on the dashboard, not buried in a spreadsheet." },
  { icon: Truck, title: "Shipping, your rules", text: "Rates by state or city, or one flat fee for everything. Set it once and checkout does the maths." },
  { icon: Percent, title: "No hidden fees", text: "Payouts are split at checkout, so there's no hidden fees." },
  { icon: ShoppingBag, title: "Bulk catalogue upload", text: "Import your whole range at once from a CSV template instead of adding items one by one." },
  { icon: LayoutDashboard, title: "One calm dashboard", text: "Orders, customers, products, payouts and staff - in one place, without the clutter." },
];

const TRUST_ITEMS = [
  { icon: Lock, text: "Card payments handled by Paystack" },
  { icon: ShieldCheck, text: "Your data stays safe and private" },
  { icon: Landmark, text: "Payouts settle to your own bank" },
];

const CHANNELS = [
  { icon: Globe, title: "Your storefront", text: "Share one link on WhatsApp, Instagram, anywhere - customers browse and buy." },
  { icon: ShoppingBag, title: "The marketplace", text: "Get discovered by shoppers browsing across every store on Storezn." },
  { icon: ScanLine, title: "In person", text: "Sell at the counter or a pop-up on the built-in point-of-sale." },
  { icon: MessageCircle, title: "Phone & WhatsApp", text: "Log an order taken off-platform so stock and takings still line up." },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const { list: featuredProducts } = await getMarketplaceProducts({ page: 1, pageSize: 3 });

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      {/* ------------ Hero */}
      <section className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 55% at 50% 0%, var(--color-brand-50), transparent 70%)" }}
        />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          <Reveal className="text-center lg:text-left">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.05] text-slate-900">
              Everything you need to manage your business
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-800 max-w-xl mx-auto lg:mx-0">
              Your own website, a shared marketplace, a point-of-sale for the counter, automatic payouts to your bank,
              and the business tools to run it, all from one clean dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white px-6 py-3.5 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer shadow-lg shadow-brand-600/25"
              >
                Get started for free
              </Link>
            </div>
          </Reveal>

          {/* Real product screenshot (public/storezn-dashboard.png), with a
              few floating status chips around it standing in for the
              things that just happened on the dashboard underneath.
              unoptimized: this deploy is self-hosted (git pull && next
              build, no Vercel/sharp), and next/image's built-in optimizer
              400s without sharp installed - same reason MarketingHeader/
              Footer's logo <Image> already use it. */}
          <Reveal delay={120} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative rounded-md border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden">
              <div className="relative aspect-[1900/1015]">
                <Image
                  src="/storezn-dashboard.png"
                  alt="Storezn vendor dashboard"
                  fill
                  priority
                  unoptimized
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>

            <div className="hidden sm:flex absolute -top-5 -left-5 items-center gap-2.5 rounded-sm border border-slate-100 bg-white px-3.5 py-3 shadow-xl shadow-slate-900/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
                <ShoppingBag size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">New order</p>
                <p className="text-[11px] text-slate-400">Just now</p>
              </div>
            </div>
            <div className="hidden sm:flex absolute top-1/3 -right-6 items-center gap-2.5 rounded-sm border border-slate-100 bg-white px-3.5 py-3 shadow-xl shadow-slate-900/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
                <CheckCircle2 size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Payment made</p>
                <p className="text-[11px] text-slate-400">Card &middot; Paystack</p>
              </div>
            </div>
            <div className="hidden sm:flex absolute -bottom-5 left-10 items-center gap-2.5 rounded-sm border border-slate-100 bg-white px-3.5 py-3 shadow-xl shadow-slate-900/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
                <Landmark size={16} />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Received in bank</p>
                <p className="text-[11px] text-slate-400">Payout settled</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- Trust strip */}
      {/* Mobile: loops sideways forever, no wrapping to fight with. */}
      <div className="sm:hidden border-y border-slate-100 bg-slate-50/70 py-3 overflow-hidden">
        <div className="flex w-max animate-marquee gap-8 pr-8">
          {[...TRUST_ITEMS, ...TRUST_ITEMS].map(({ icon: Icon, text }, i) => (
            <span key={i} className="flex items-center gap-2 text-xs text-slate-800 whitespace-nowrap">
              <Icon size={14} className="text-slate-400 shrink-0" />
              {text}
            </span>
          ))}
        </div>
      </div>
      {/* Desktop: plenty of room, centred and static. */}
      <div className="hidden sm:block max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-slate-800">
          {TRUST_ITEMS.map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-2">
              <Icon size={14} className="text-slate-400" />
              {text}
            </span>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------------- Feature grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <Reveal className="text-center max-w-xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Everything to run a real business</h2>
          <p className="mt-3 text-slate-800">Not a page builder with a shop bolted on. The whole operation.</p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PERKS.map(({ icon: Icon, title, text }, i) => (
            <Reveal
              key={title}
              delay={(i % 3) * 80}
              className="group relative overflow-hidden bg-white border border-slate-100 rounded-sm p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <Icon
                size={108}
                strokeWidth={1.25}
                aria-hidden="true"
                className="pointer-events-none absolute -right-5 -bottom-6 text-brand-600/7 transition-colors duration-300 group-hover:text-brand-600/13"
              />
              <div className="relative">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-1.5 text-sm text-slate-800 leading-relaxed">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- Sell everywhere, one place */}
      <section className="bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Sell everywhere. Track it in one place.</h2>
            <p className="mt-4 text-slate-800 leading-relaxed">
              A sale is a sale, whether it came from your link, the marketplace, the till at your shop, or a WhatsApp
              message. Every one of them pulls the same stock down and lands in the same order history, so your
              numbers are never split across four places.
            </p>
            <Link
              href="/help"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See how it works
            </Link>
          </Reveal>
          <div className="space-y-3">
            {CHANNELS.map(({ title, text }, i) => (
              <Reveal
                key={title}
                delay={i * 70}
                className="bg-white border border-slate-100 rounded-sm p-5 shadow-sm"
              >
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-800">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Marketplace teaser */}
      {featuredProducts.length > 0 && (
        <section className="bg-slate-50/70 border-y border-slate-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <Reveal className="flex items-end justify-between gap-4 mb-8 flex-wrap">
              <div>
                <h2 className="font-display text-2xl sm:text-4xl font-bold text-slate-900">Shop the Marketplace</h2>
                <p className="mt-2 text-slate-800">Real products from real businesses already selling on Storezn.</p>
              </div>
              <Link href="/marketplace" className="text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1.5 shrink-0">
                See the marketplace
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
          <Link
            href="/pricing"
            className="mt-7 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 border border-brand-200 bg-brand-50 px-6 py-3 rounded-sm hover:bg-brand-100 transition-colors cursor-pointer"
          >
            See Pricing
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
            <p className="mt-3 text-white/60">Set it up now. Add your first product before your coffee&apos;s cold.</p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-white text-brand-900 px-6 py-3.5 rounded-sm hover:bg-brand-50 transition-colors cursor-pointer"
            >
              Get started for free
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
