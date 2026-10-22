import Link from "next/link";
import Image from "next/image";
import { and, count, eq } from "drizzle-orm";
import {
  Store,
  Truck,
  ArrowRight,
  ShoppingBag,
  TrendingUp,
  Package,
  ShieldCheck,
  Lock,
  Landmark,
  Globe,
  CheckCircle2,
  FileText,
  CreditCard,
  Check,
  ChevronDown,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { Reveal } from "@/components/Reveal.jsx";
import { db } from "@/lib/db/index.js";
import { platformSettings, products, stores } from "@/lib/db/schema.js";
import { getMarketplaceProducts } from "@/lib/marketplace.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { formatCurrency } from "@/lib/format.js";

// The homepage's job is trust: say plainly what Storezn does, show how the
// money moves (it never sits with us), state the fee in numbers, and
// answer the questions people ask before handing over their business.
// No testimonials or logos we can't stand behind - real counts only, and
// only once they're big enough to mean something.

const FEATURES = [
  { icon: Store, title: "Your own website", text: "A shop on your own storezn.com link, live in minutes. Share it on WhatsApp, Instagram, anywhere." },
  { icon: FileText, title: "Invoices & quotes", text: "Price custom orders, send a payment link, and let customers pay in full or part now, part later." },
  { icon: Globe, title: "Sell abroad", text: "Show prices in dollars, accept foreign cards and Apple Pay, deliver to other countries." },
  { icon: Package, title: "Stock that stays right", text: "Stock moves the moment an order comes in, so the number you see is the number you have." },
  { icon: Truck, title: "Delivery, your rules", text: "One fee for everywhere, or different fees by state, city or country. Checkout does the maths." },
  { icon: TrendingUp, title: "Know your numbers", text: "Sales, best sellers and low stock on one simple dashboard - on your phone or computer." },
];

const PAYMENT_STEPS = [
  { icon: CreditCard, title: "Your customer pays", text: "By card, bank transfer, USSD or Apple Pay, on Paystack's secure checkout." },
  { icon: Lock, title: "It's split instantly", text: "Your share goes to your own Paystack account at checkout. Storezn never holds your money." },
  { icon: Landmark, title: "It lands in your bank", text: "Paystack pays it into your bank account, usually the next business day." },
];

const FAQ = [
  {
    q: "Is my money safe?",
    a: "Payments are processed by Paystack, a licensed Nigerian payment company. Your share is split to your own Paystack account at the moment of payment, so it never sits in a Storezn account.",
  },
  {
    q: "When do I get paid?",
    a: "Online payments are paid into your linked bank account by Paystack, usually the next business day. Your Payouts page shows every payment.",
  },
  {
    q: "What does it cost?",
    a: "You can start for free. Each online payment has one processing fee, shown before anyone pays, and you choose whether you or your customer covers it. Storezn+ adds extras for a monthly fee.",
  },
  {
    q: "Can customers outside Nigeria buy from me?",
    a: "Yes. Turn on international payments and your shop shows dollar prices and takes foreign cards and Apple Pay. You still set prices and get paid in naira.",
  },
  {
    q: "What if I price each order differently?",
    a: "Use invoices. Add the items - even ones not in your shop - set the price, and send the link. Customers can pay in full, or a deposit now and the rest later.",
  },
  {
    q: "Why do you ask for my NIN?",
    a: "Every seller is identity-checked before their shop goes live. It keeps fake sellers off Storezn, so customers can trust the shops they find here.",
  },
];

export const dynamic = "force-dynamic";

async function getTrustData() {
  try {
    const [[settings], [{ storeCount }], [{ productCount }]] = await Promise.all([
      db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1),
      db.select({ storeCount: count() }).from(stores).where(eq(stores.isActive, true)),
      db.select({ productCount: count() }).from(products).where(and(eq(products.isActive, true))),
    ]);
    return { settings: settings || null, storeCount: Number(storeCount), productCount: Number(productCount) };
  } catch {
    return { settings: null, storeCount: 0, productCount: 0 };
  }
}

const roundDown = (n, step) => Math.floor(n / step) * step;

function feeText(rate, flat) {
  const pct = `${Number(rate || 0)}%`;
  return Number(flat) > 0 ? `${pct} + ${formatCurrency(flat)}` : pct;
}

export default async function Home() {
  const [{ list: featuredProducts }, trust] = await Promise.all([
    getMarketplaceProducts({ page: 1, pageSize: 4 }),
    getTrustData(),
  ]);
  const s = trust.settings;
  // Counts only once they're worth saying, rounded down ("200+").
  const stats = [
    trust.storeCount >= 20 && { value: `${roundDown(trust.storeCount, 10)}+`, label: "businesses selling" },
    trust.productCount >= 100 && { value: `${roundDown(trust.productCount, 100).toLocaleString("en-NG")}+`, label: "products listed" },
  ].filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      {/* ------------------------------------------------------------------ Hero */}
      <section className="relative px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(70% 55% at 50% 0%, var(--color-brand-50), transparent 70%)" }}
        />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          <Reveal className="text-center lg:text-left">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.05] tracking-tight text-slate-900">
              Sell online. Get paid straight to your bank.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-700 max-w-xl mx-auto lg:mx-0">
              Your own online shop, invoices you can send in a minute, and customers anywhere in the world - with
              every payment going to your account, not ours.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white px-6 py-3.5 rounded-sm hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/25"
              >
                Start for free <ArrowRight size={16} />
              </Link>
              <a
                href="#how-you-get-paid"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 text-sm font-semibold text-slate-800 border border-slate-300 bg-white px-6 py-3.5 rounded-sm hover:border-slate-400 transition-colors"
              >
                How payments work
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-slate-600">
              {["Free to start", "No card needed", "Set up in minutes"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check size={15} className="text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Real product screenshot with a few floating "what just
              happened" chips. unoptimized: self-hosted, no sharp - see
              MarketingHeader. */}
          <Reveal delay={120} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative rounded-md border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden bg-white">
              <div className="relative aspect-[1900/1015]">
                <Image
                  src="/storezn-dashboard.png"
                  alt="The Storezn seller dashboard"
                  fill
                  priority
                  unoptimized
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
            <Chip className="-top-5 -left-5" icon={ShoppingBag} title="New order" sub="Just now" />
            <Chip className="top-1/3 -right-6" icon={Globe} title="Paid from abroad" sub="Card · Paystack" />
            <Chip className="-bottom-5 left-10" icon={Landmark} title="Received in bank" sub="Payout settled" />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- Trust strip */}
      <section className="border-y border-slate-100 bg-slate-50/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-center gap-x-10 gap-y-3 text-sm text-slate-700">
          <span className="inline-flex items-center gap-2"><Lock size={16} className="text-brand-600" /> Payments by Paystack</span>
          <span className="inline-flex items-center gap-2"><Landmark size={16} className="text-brand-600" /> Paid to your own bank</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-brand-600" /> Verified sellers only</span>
          {stats.map((stat) => (
            <span key={stat.label} className="inline-flex items-center gap-1.5">
              <strong className="font-semibold text-slate-900">{stat.value}</strong> {stat.label}
            </span>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- How you get paid */}
      <section id="how-you-get-paid" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full scroll-mt-20">
        <Reveal className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold text-brand-700">How you get paid</p>
          <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">Your money goes to you, not to us</h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {PAYMENT_STEPS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 90} className="relative rounded-sm border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white text-sm font-bold">{i + 1}</span>
                <Icon size={20} className="text-brand-700" />
              </div>
              <p className="mt-4 font-semibold text-slate-900">{title}</p>
              <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{text}</p>
            </Reveal>
          ))}
        </div>
        {s && (
          <Reveal className="mt-6 rounded-sm border border-brand-200 bg-brand-50/60 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold text-slate-900">One fee, shown upfront</p>
              <p className="mt-1 text-sm text-slate-700">
                Processing Fee per online payment: <strong className="text-slate-900">{feeText(s.defaultCommissionRatePercent, s.defaultFlatFee)}</strong>
                {" "}· foreign cards: <strong className="text-slate-900">{feeText(s.intlCommissionRatePercent, s.intlFlatFee)}</strong>.
                {" "}You choose whether you or your customer pays it. No setup fee, no monthly fee on the free plan.
              </p>
            </div>
            <Link href="/pricing" className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
              See pricing <ArrowRight size={15} />
            </Link>
          </Reveal>
        )}
      </section>

      {/* -------------------------------------------------------------- Features */}
      <section className="bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <Reveal className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">Everything to run your business</h2>
            <p className="mt-3 text-slate-700">Simple enough to set up today. Complete enough that you won&apos;t outgrow it.</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={(i % 3) * 80} className="rounded-sm border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
                <span className="grid h-10 w-10 place-items-center rounded-sm bg-brand-100 text-brand-700">
                  <Icon size={20} />
                </span>
                <p className="mt-4 font-semibold text-slate-900">{title}</p>
                <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- Spotlight: invoices */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <p className="text-sm font-semibold text-brand-700">Invoices & quotes</p>
          <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">Custom order? Send a payment link.</h2>
          <p className="mt-4 text-slate-700 leading-relaxed">
            For the orders you price one by one - tailoring, furniture, cakes, bulk supply. Add the items, set your
            price and send the link on WhatsApp. Your customer pays securely online.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-800">
            {[
              "Add items that aren't even in your shop",
              "Let them pay a deposit now - you choose how much - and the rest later",
              "Change the price any time before they've paid",
              "Customers can ask you for a quote straight from your shop",
            ].map((t) => (
              <li key={t} className="flex gap-2.5"><CheckCircle2 size={18} className="shrink-0 text-brand-600" /> {t}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <div className="mx-auto max-w-sm rounded-md border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Invoice from Ada&apos;s Designs</p>
                <p className="text-xs text-slate-500">For Chioma O.</p>
              </div>
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Not paid</span>
            </div>
            <div className="space-y-2 py-4 text-sm">
              <MockLine label="Custom aso-ebi gown × 1" value="₦85,000" />
              <MockLine label="Matching gele × 1" value="₦15,000" />
            </div>
            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <MockLine label="Total" value="₦100,000" strong />
              <MockLine label="Deposit today (40%)" value="₦40,000" accent />
            </div>
            <div className="mt-4 rounded-sm bg-brand-600 py-2.5 text-center text-sm font-semibold text-white">Pay ₦40,000</div>
            <p className="mt-2 text-center text-[11px] text-slate-500">Secured by Paystack</p>
          </div>
        </Reveal>
      </section>

      {/* ----------------------------------------------- Spotlight: international */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal className="lg:order-2">
            <p className="text-sm font-semibold text-brand-300">Sell abroad</p>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight">Customers abroad pay in dollars. You get naira.</h2>
            <p className="mt-4 text-slate-300 leading-relaxed">
              Family in London, customers in Houston, buyers in Accra - turn on international payments and your shop
              speaks their currency.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              {[
                "Prices shown in dollars at today's market rate - you still set them in naira",
                "Foreign Visa and Mastercard cards and Apple Pay accepted",
                "Deliver to the countries you choose, with fees per country",
                "Works for invoices too",
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckCircle2 size={18} className="shrink-0 text-brand-400" /> {t}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="lg:order-1">
            <div className="mx-auto max-w-sm rounded-md bg-white p-5 text-slate-900 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Checkout</p>
                <span className="inline-flex rounded-full border border-slate-200 p-0.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">$ USD</span>
                  <span className="px-2 py-0.5 text-slate-500">₦ NGN</span>
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <MockLine label="Handwoven tote bag × 2" value="$48.00" />
                <MockLine label="Delivery to United Kingdom" value="$18.00" />
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <MockLine label="Total" value="$66.00" strong />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs font-semibold">
                <span className="rounded-sm border border-slate-200 py-2">Card</span>
                <span className="rounded-sm border border-slate-200 py-2">Apple Pay</span>
              </div>
              <p className="mt-3 rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-900">
                <Landmark size={13} className="mr-1 inline -mt-0.5" /> You receive naira in your Nigerian bank account.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- Marketplace teaser */}
      {featuredProducts.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
          <Reveal className="flex items-end justify-between gap-4 mb-8 flex-wrap">
            <div>
              <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">Real shops, selling today</h2>
              <p className="mt-2 text-slate-700">A few products from businesses already on Storezn.</p>
            </div>
            <Link href="/marketplace" className="text-sm font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1.5 shrink-0">
              Visit the marketplace <ArrowRight size={15} />
            </Link>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product, i) => (
              <Reveal key={product.id} delay={i * 70}>
                <a
                  href={`${getStorefrontUrl(product.store)}/products/${product.slug}?from=marketplace`}
                  className="group block overflow-hidden rounded-sm border border-slate-200 bg-white transition-shadow hover:shadow-lg"
                >
                  <div className="aspect-square bg-slate-50">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-slate-300">No image</span>
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-brand-700">{product.store.name}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{product.name}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(getEffectivePrice(product.price, product.discountPercent))}</p>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------- FAQ */}
      <section className={`border-t border-slate-100 ${featuredProducts.length > 0 ? "bg-slate-50/70" : ""}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <Reveal className="text-center mb-10">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">Questions sellers ask us</h2>
          </Reveal>
          <div className="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 -mt-1 text-sm leading-relaxed text-slate-700">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">
            Something else? <Link href="/help" className="font-semibold text-brand-700 hover:underline">Read the seller guide</Link> or message us - a real person replies.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- Final CTA */}
      <section className="bg-brand-900 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(50% 80% at 80% 20%, var(--color-brand-700), transparent)" }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">Open your shop today</h2>
            <p className="mt-3 text-white/70">Free to start. Your first product can be live in a few minutes.</p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-white text-brand-900 px-6 py-3.5 rounded-sm hover:bg-brand-50 transition-colors"
            >
              Start for free <ArrowRight size={16} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Footer's own mt-10 would show a white strip under the dark band. */}
      <div className="-mt-10">
        <Footer />
      </div>
    </div>
  );
}

function Chip({ className, icon: Icon, title, sub }) {
  return (
    <div className={`hidden sm:flex absolute items-center gap-2.5 rounded-sm border border-slate-100 bg-white px-3.5 py-3 shadow-xl shadow-slate-900/10 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
        <Icon size={16} />
      </span>
      <div>
        <p className="text-xs font-semibold text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

function MockLine({ label, value, strong = false, accent = false }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-slate-900" : accent ? "font-semibold text-brand-700" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
