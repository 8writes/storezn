import { Info } from "lucide-react";

// One wording, used by every storefront surface that renders product
// media AND by the vendor-side toggle that turns it on, so the seller is
// setting exactly the sentence their shopper will read.
export const IMAGE_DISCLAIMER_TEXT = "Image for illustration purposes only";

// Sits inside the image's own `relative` box, pinned to the bottom so it
// never collides with the discount / out-of-stock pills in the top-left.
// A translucent strip rather than a floating pill: it has to stay legible
// over a photo of any colour, which a plain text overlay does not.
//
// The full sentence renders at every size and truncates rather than
// wrapping on a narrow grid thumbnail - a half-read disclaimer that still
// says "Image for illustration..." carries the meaning, and the title
// attribute keeps the whole thing available.
export function ImageDisclaimerBadge({ size = "sm" }) {
  const isLarge = size === "lg";
  return (
    <span
      title={IMAGE_DISCLAIMER_TEXT}
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 bg-slate-900/65 text-white backdrop-blur-[1px] ${
        isLarge ? "px-3 py-1.5 text-xs" : "px-1.5 py-1 text-[10px]"
      }`}
    >
      <Info size={isLarge ? 13 : 11} className="shrink-0" aria-hidden="true" />
      <span className="truncate font-medium">{IMAGE_DISCLAIMER_TEXT}</span>
    </span>
  );
}
