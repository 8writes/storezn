"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button.js";

// Shown once, as a dialog, only when arriving from a marketplace product
// link (see MarketplaceGrid.js's ProductCard href, which appends
// ?from=marketplace) - the marketplace itself never hosts checkout, so
// this makes the handoff to the vendor's own storefront explicit (browsing,
// cart, checkout, everything from here on is with this vendor) before the
// shopper does anything, rather than a passive banner they might not
// notice. Same chrome as StorageLimitDialog.js.
export function MarketplaceBanner({ storeName }) {
  const searchParams = useSearchParams();
  const fromMarketplace = searchParams.get("from") === "marketplace";
  const [open, setOpen] = useState(fromMarketplace);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!fromMarketplace || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm p-6 space-y-4 my-auto">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-sm mb-2">
            Important
          </span>
          <h2 className="font-semibold text-slate-900">You&apos;re now on {storeName}&apos;s store</h2>
          <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
            You followed a product here from the Storezn marketplace. From here on, everything you do - browsing, your cart, checkout - is with <strong className="text-slate-900">{storeName}</strong> directly, not Storezn itself.
          </p>
        </div>

        <Button fullWidth onClick={() => setOpen(false)}>Got it</Button>
      </div>
    </div>
  );
}
