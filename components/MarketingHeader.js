import Image from "next/image";
import Link from "next/link";

// Shared header for the public marketing pages (landing, pricing,
// stores directory) - not used by the dashboard or storefront, which
// have their own headers.
export function MarketingHeader() {
  return (
    <header className="bg-brand-900">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16 gap-4">
        <Link href="/" className="shrink-0">
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized className="h-6 sm:h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5 text-sm">
          <Link href="/stores" className="hidden sm:inline text-white hover:text-white/80 transition-colors">
            Discover stores
          </Link>
          <Link href="/pricing" className="hidden sm:inline text-white hover:text-white/80 transition-colors">
            Pricing
          </Link>
          <Link
            href="/signup"
            className="font-semibold bg-white text-brand-900 px-3.5 sm:px-4 py-2 rounded-sm hover:bg-brand-50 transition-colors text-xs sm:text-sm whitespace-nowrap"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
