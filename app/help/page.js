import Image from "next/image";
import Link from "next/link";
import { HelpGuideContent } from "@/components/HelpGuideContent.js";
import { Footer } from "@/components/Footer.js";

export const metadata = {
  title: "Vendor Guide - Storezn",
  description: "A plain-language, step-by-step guide to setting up and running a store on Storezn.",
};

// Same guide as /vendor/help, but reachable without signing in - a vendor
// deciding whether to sign up (or one locked out of their account) needs
// this before they have a session, not just after.
export default function PublicHelpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16 bg-brand-900 shrink-0">
        <Link href="/" className="flex items-center">
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
        </Link>
        <Link href="/signup" className="text-sm font-semibold text-white hover:underline">
          Get started
        </Link>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
        <HelpGuideContent />
      </main>

      <Footer />
    </div>
  );
}
