import { Skeleton } from "@/components/ui/Skeleton.js";

// Storefront pages resolve their store/product data server-side, so
// without this, clicking any link here blocks with a blank tab until that
// finishes. This fires instantly instead - the header (in layout.js) stays
// mounted, only the content area below it shows this fallback.
export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
