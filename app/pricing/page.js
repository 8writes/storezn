import Link from "next/link";
import { Check, Minus, ArrowRight, ChevronDown } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { db } from "@/lib/db/index.js";
import { platformSettings } from "@/lib/db/schema.js";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/format.js";
import { STOREFRONT_FONTS } from "@/lib/storefrontFontOptions.js";

const SUPPORT_EMAIL = "support@ozmictech.com";

export const metadata = {
  title: "Pricing - Storezn",
  description: "Start free. Upgrade to Storezn+ for your own domain, your brand colours and fonts, unlimited products and more.",
};

// Pricing/limits are admin-editable (see /super-admin/settings), so read
// them at request time instead of making `next build` depend on Postgres.
export const dynamic = "force-dynamic";

async function getSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  return row || { plusMonthlyPrice: 5000, freeStorageMb: 500, plusStorageMb: 5000, freeStaffLimit: 1, plusStaffLimit: 10, freeBranchLimit: 1, plusBranchLimit: 5, defaultCommissionRatePercent: 1.5, defaultFlatFee: 100 };
}

const mb = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString("en-NG")}GB` : `${n}MB`);
const feeText = (rate, flat) => (Number(flat) > 0 ? `${Number(rate)}% + ${formatCurrency(flat)}` : `${Number(rate)}%`);

// Storezn Enterprise has no self-serve checkout - it's arranged with the
// Storezn team (see app/(dashboard)/vendor/plus/page.js and the
// super-admin store page), priced around a store's branches and tills.
const ENTERPRISE_FEATURES = [
  "Everything in Storezn+",
  "Shop till (POS) on any phone, tablet or computer",
  "Cashier shifts and cash-drawer counts",
  "Keeps selling when the internet drops",
  "Month-end report: what sold, who sold it, where the money went",
];

export default async function PricingPage() {
  const s = await getSettings();
  const discountPercent = Number(s.plusIntroDiscountPercent || 0);
  const price = Number(s.plusMonthlyPrice);
  const firstMonth = Math.round(price * (1 - discountPercent / 100) * 100) / 100;
  const perDay = Math.round(price / 30);

  // The reasons people upgrade - outcomes, not settings.
  const PLUS_HIGHLIGHTS = [
    { title: "Your own web address", text: "yourbrand.com instead of yourbrand.storezn.com. Customers trust it more." },
    { title: "Your brand, your look", text: `Your own colour and font (${STOREFRONT_FONTS.length} to choose from) across your whole shop and invoices.` },
    { title: "No Storezn branding", text: "Your shop footer shows only your business." },
    { title: "Unlimited products", text: "List your whole range - no 50-product cap." },
    { title: "Record sales you make yourself", text: "In person, on WhatsApp or on the phone - stock and sales stay in one place." },
    { title: "Room to grow", text: `${s.plusStaffLimit} staff, ${s.plusBranchLimit} branches and ${mb(s.plusStorageMb)} for photos.` },
  ];

  // [label, free, plus, enterprise] - true/false or text.
  const COMPARE = [
    ["Your own online shop", true, true, true],
    ["Payments straight to your bank", true, true, true],
    ["Invoices, quotes and deposits", true, true, true],
    ["Sell abroad (dollar prices, foreign cards)", true, true, true],
    ["Products", "Up to 50", "Unlimited", "Unlimited"],
    ["Web address", "yourshop.storezn.com", "Your own domain", "Your own domain"],
    ["Brand colour & font", false, true, true],
    ["Storezn link in your shop footer", "Shown", "Removed", "Removed"],
    ["Record in-person / WhatsApp sales", false, true, true],
    ["Staff logins", String(s.freeStaffLimit), String(s.plusStaffLimit), "Custom"],
    ["Branches", String(s.freeBranchLimit ?? 1), String(s.plusBranchLimit), "Custom"],
    ["Photo storage", mb(s.freeStorageMb), mb(s.plusStorageMb), "Custom"],
    ["Shop till (POS), shifts & cash drawer", false, false, true],
  ];

  const FAQ = [
    { q: "Can I cancel any time?", a: "Yes, from Plans in your dashboard. You keep Storezn+ until the end of the month you've paid for. No contract, no cancellation fee." },
    { q: "What happens if I stop paying?", a: "Your store moves back to the free plan. Nothing is deleted - your products, orders and customers stay. The paid extras switch off until you subscribe again." },
    { q: "How do I pay?", a: "By card, through Paystack, once a month. You can upgrade in a minute from your dashboard." },
    { q: "Do I need to buy a domain?", a: "Only if you want your own address. You can buy one from any domain seller and connect it in a few steps - or keep your free storezn.com address." },
    { q: "Are there other fees?", a: `Only the processing fee on online payments (${feeText(s.defaultCommissionRatePercent, s.defaultFlatFee)}), which is the same on every plan. You choose whether you or your customer pays it.` },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      <main className="flex-1">
        {/* ------------------------------------------------------------ Hero */}
        <section className="relative px-4 sm:px-6 pt-14 sm:pt-20 pb-4 text-center">
          <div className="absolute inset-0 -z-10 opacity-60" style={{ background: "radial-gradient(60% 50% at 50% 0%, var(--color-brand-50), transparent)" }} />
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">Start free. Upgrade when you&apos;re ready.</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-xl mx-auto">
            Everything you need to sell is free. Storezn+ makes your shop look like a big brand.
          </p>
        </section>

        {/* ----------------------------------------------------------- Plans */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Free */}
          <div className="order-2 lg:order-1 rounded-sm border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-sm font-semibold text-slate-700">Free</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">₦0</p>
            <p className="mt-1 text-sm text-slate-500">Free forever</p>
            <p className="mt-4 text-sm text-slate-700">For getting started and selling online.</p>
            <Link href="/signup" className="mt-6 flex items-center justify-center rounded-sm border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors">
              Start free
            </Link>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
              {["Your own shop on storezn.com", "Payments to your bank", "Invoices & deposits", "Sell abroad", "Up to 50 products"].map((f) => (
                <li key={f} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-brand-600" />{f}</li>
              ))}
            </ul>
          </div>

          {/* Storezn+ */}
          <div className="order-1 lg:order-2 relative rounded-sm border-2 border-brand-500 bg-white p-6 sm:p-7 shadow-2xl shadow-brand-900/10">
            <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">Recommended</span>
            <p className="text-sm font-semibold text-brand-700">Storezn+</p>
            {discountPercent ? (
              <>
                <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
                  {formatCurrency(firstMonth)}
                  <span className="ml-2 align-middle text-lg font-semibold text-slate-400 line-through">{formatCurrency(price)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">for your first month, then {formatCurrency(price)}/month</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
                  {formatCurrency(price)}<span className="text-base font-medium text-slate-500">/month</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">about {formatCurrency(perDay)} a day</p>
              </>
            )}
            <p className="mt-4 text-sm text-slate-700">For businesses ready to look professional and grow.</p>
            <Link
              href="/signup?next=%2Fvendor%2Fplus"
              className="mt-6 flex items-center justify-center gap-2 rounded-sm bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 transition-colors"
            >
              Get Storezn+ <ArrowRight size={16} />
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">Cancel any time · Already selling? Upgrade from your dashboard</p>
            <ul className="mt-6 space-y-3.5">
              {PLUS_HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex gap-2.5">
                  <Check size={16} className="mt-1 shrink-0 text-brand-600" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{h.title}</span>
                    <span className="block text-sm text-slate-600">{h.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Enterprise */}
          <div className="order-3 rounded-sm bg-neutral-950 p-6 sm:p-7 text-white">
            <p className="text-sm font-semibold text-white/70">Enterprise</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">Custom</p>
            <p className="mt-1 text-sm text-white/60">Priced around your branches and tills</p>
            <p className="mt-4 text-sm text-white/80">For supermarkets, pharmacies and shops with a counter.</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Storezn Enterprise enquiry")}`}
              className="mt-6 flex items-center justify-center gap-2 rounded-sm bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 transition-colors"
            >
              Talk to us <ArrowRight size={16} />
            </a>
            <ul className="mt-6 space-y-2.5 text-sm text-white/85">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-brand-400" />{f}</li>
              ))}
            </ul>
          </div>
        </section>

        <p className="px-4 text-center text-sm text-slate-600">
          Every plan: payments by Paystack, money paid to your own bank, processing fee of {feeText(s.defaultCommissionRatePercent, s.defaultFlatFee)} per online payment.
        </p>

        {/* ------------------------------------------------------ Comparison */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="text-center font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Compare plans</h2>
          <div className="mt-8 overflow-x-auto rounded-sm border border-slate-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-900">&nbsp;</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">Free</th>
                  <th className="px-4 py-3 font-semibold text-brand-700 bg-brand-50">Storezn+</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([label, ...cells]) => (
                  <tr key={label} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-800">{label}</td>
                    {cells.map((cell, i) => (
                      <td key={i} className={`px-4 py-3 ${i === 1 ? "bg-brand-50/50" : ""}`}>
                        {cell === true ? (
                          <Check size={18} className="text-brand-600" aria-label="Included" />
                        ) : cell === false ? (
                          <Minus size={18} className="text-slate-300" aria-label="Not included" />
                        ) : (
                          <span className="text-slate-800">{cell}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section className="bg-slate-50/70 border-t border-slate-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-center font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Questions about plans</h2>
            <div className="mt-8 divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="-mt-1 px-5 pb-5 text-sm leading-relaxed text-slate-700">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Try it free today</h2>
          <p className="mt-3 text-slate-700">Open your shop in minutes. Upgrade whenever you want - your products and orders come with you.</p>
          <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-sm bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
              Start free <ArrowRight size={16} />
            </Link>
            <Link href="/signup?next=%2Fvendor%2Fplus" className="inline-flex items-center justify-center rounded-sm border border-slate-300 px-6 py-3.5 text-sm font-semibold text-slate-800 hover:border-slate-400 transition-colors">
              Go straight to Storezn+
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
