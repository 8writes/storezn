"use client";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPlatformUrl } from "@/lib/storeUrl.js";

// Shown only when arriving from a marketplace product link (see
// MarketplaceGrid.js's ProductCard href, which appends ?from=marketplace)
// - the marketplace itself never hosts checkout, so this makes the
// handoff to the vendor's own storefront explicit and gives a way back
// rather than leaving the shopper wondering how they got here.
export function MarketplaceBanner({ storeName }) {
  const searchParams = useSearchParams();
  if (searchParams.get("from") !== "marketplace") return null;

  return (
    <div className="bg-brand-50 border-b border-brand-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
        <span className="text-brand-800">
          You&apos;ve left the Storezn marketplace to shop <strong>{storeName}</strong> directly.
        </span>
        <a
          href={getPlatformUrl("/stores")}
          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900 shrink-0"
        >
          <ArrowLeft size={14} />
          Back to marketplace
        </a>
      </div>
    </div>
  );
}
