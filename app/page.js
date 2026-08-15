import Image from "next/image";
import Link from "next/link";
import { Store, Wallet, Truck, LayoutDashboard, Percent } from "lucide-react";
import { Footer } from "@/components/Footer";

const PERKS = [
  { icon: Store, text: "Your own store, live in minutes - custom domain supported." },
  { icon: Wallet, text: "Automatic payouts straight to your bank account the next day." },
  { icon: Truck, text: "Set your own shipping rates by state or city, or one flat rate for everything." },
  { icon: LayoutDashboard, text: "A simple dashboard for orders, customers, and products - no clutter." },
  { icon: Percent, text: "You decide who pays the platform fee - absorb it, or pass it to your customers." },
];

// No public marketing site yet - out of scope for Phase 1 (vendor/store
// onboarding + auth). Just a minimal landing that gets people to sign up.
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="flex items-center px-4 sm:px-6 h-16 bg-brand-900">
        <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="sr-only">Storezn</h1>
        <p className="text-lg text-slate-500 max-w-md">Get your own dedicated online store. Free forever.</p>

        <ul className="mt-10 space-y-4 text-left max-w-sm w-full">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon size={18} className="text-brand-600 shrink-0 mt-0.5" />
              <span className="text-sm text-slate-700">{text}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/signup"
          className="mt-10 inline-flex items-center justify-center text-sm font-semibold bg-brand-600 text-white px-6 py-3 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer uppercase"
        >
          Get started now!
        </Link>
      </main>
      <Footer />
    </div>
  );
}
