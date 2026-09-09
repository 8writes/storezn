import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Access restricted - Storezn",
  robots: { index: false, follow: false },
};

export default function BannedPage({ searchParams }) {
  const reason = typeof searchParams?.reason === "string" ? searchParams.reason : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1 max-w-lg mx-auto px-4 sm:px-6 py-20 space-y-6">
        <div>
          <Link href="/" className="text-sm text-brand-600 hover:underline">Storezn</Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-4">Your access has been restricted</h1>
        </div>

        <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <p>
            This account or device has been suspended for activity that breaks the{" "}
            <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link> &mdash; for example
            creating accounts in bulk, scraping or bulk-downloading data, sharing access, attempting to reverse-engineer
            or copy the platform, or other abuse.
          </p>
          {reason && (
            <p className="bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 text-slate-600">
              <span className="font-medium text-slate-700">Reason on file:</span> {reason}
            </p>
          )}

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <p className="font-medium text-slate-900">Think this is a mistake?</p>
            <p>
              You can appeal. Email{" "}
              <a href="mailto:support@ozmictech.com?subject=Account%20appeal" className="text-brand-600 hover:underline font-medium">
                support@ozmictech.com
              </a>{" "}
              from the email address on the account, tell us what happened, and we&apos;ll review it. Most appeals are
              answered within a few business days.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
