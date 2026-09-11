import { HelpGuideContent } from "@/components/HelpGuideContent.js";
import { Footer } from "@/components/Footer.js";
import { MarketingHeader } from "@/components/MarketingHeader.js";

export const metadata = {
  title: "Vendor Guide - Storezn",
  description: "A plain-language, step-by-step guide to setting up and running a store on Storezn.",
};

// Same guide as /vendor/help, but reachable without signing in - a vendor
// deciding whether to sign up (or one locked out of their account) needs
// this before they have a session, not just after. Shares the same
// MarketingHeader as every other public page instead of its own
// hand-rolled bar, so it stays in sync with it (nav links, scroll
// elevation, styling) instead of drifting out of date.
export default function PublicHelpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <MarketingHeader />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
        <HelpGuideContent />
      </main>

      <Footer />
    </div>
  );
}
