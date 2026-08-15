import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { MarketingHeader } from "@/components/MarketingHeader";
import { db } from "@/lib/db/index.js";
import { platformSettings } from "@/lib/db/schema.js";
import { eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/format.js";

// Pricing/limits are admin-editable (see /super-admin/settings) - revalidate
// periodically rather than baking them into the static build, same
// reasoning as tixzn's FAQ page.
export const revalidate = 300;

async function getSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  return row || { plusMonthlyPrice: 5000, freeStorageMb: 500, plusStorageMb: 5000, freeStaffLimit: 1, plusStaffLimit: 10 };
}

export default async function PricingPage() {
  const settings = await getSettings();

  const FREE_FEATURES = [
    "Your own store, with a custom domain if you want one",
    "Unlimited products",
    "Automatic payouts to your bank account",
    `${settings.freeStorageMb.toLocaleString("en-NG")}MB of image storage`,
    `${settings.freeStaffLimit} staff seat`,
  ];

  const PLUS_FEATURES = [
    "Everything in Free",
    "Record offline orders (in-person, phone, cash sales)",
    "A custom accent color for your storefront",
    `${settings.plusStorageMb.toLocaleString("en-NG")}MB of image storage`,
    `${settings.plusStaffLimit} staff seats`,
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-clip">
      <MarketingHeader />

      <main className="flex-1">
        <section className="relative px-4 sm:px-6 pt-16 sm:pt-20 pb-6 text-center">
          <div
            className="absolute inset-0 -z-10 opacity-60"
            style={{ background: "radial-gradient(60% 50% at 50% 0%, var(--color-brand-50), transparent)" }}
          />
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">Simple pricing</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-500 max-w-md mx-auto">
            Every store starts free, with everything you need to sell online. Upgrade only if you outgrow it.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free plan - flat card, sits behind/below the Plus card */}
          <div className="bg-white border border-slate-200 rounded-sm p-8 shadow-sm">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Free</p>
            <p className="mt-2 text-4xl font-extrabold text-slate-900">₦0</p>
            <p className="mt-1 text-sm text-slate-400">forever</p>
            <ul className="mt-6 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 px-5 py-3 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Start free
            </Link>
          </div>

          {/* Storezn+ - raised with a stronger shadow + slight lift, the
              layered-depth cue that this is the "elevated" tier. */}
          <div className="relative bg-white border-2 border-brand-200 rounded-sm p-8 shadow-2xl shadow-brand-900/10 md:-translate-y-3">
            <span className="absolute -top-3 left-8 text-xs font-bold uppercase tracking-wide bg-brand-600 text-white px-3 py-1 rounded-full">
              Most capable
            </span>
            <p className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Storezn+</p>
            <p className="mt-2 text-4xl font-extrabold text-slate-900">
              {formatCurrency(settings.plusMonthlyPrice)}
              <span className="text-base font-medium text-slate-400">/month</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">cancel anytime</p>
            <ul className="mt-6 space-y-3">
              {PLUS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?next=%2Fvendor%2Fsettings%3Fupgrade%3Dplus%23storezn-plus"
              className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white px-5 py-3 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer shadow-lg shadow-brand-600/20"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <p className="text-sm text-slate-500">
            Already have a store? Upgrade to Storezn+ any time from{" "}
            <span className="font-medium text-slate-700">Store settings</span> in your dashboard.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
