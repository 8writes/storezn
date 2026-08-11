import { Skeleton, StatGridSkeleton, CardListSkeleton } from "@/components/ui/Skeleton.js";

// Generic fallback shown the instant a dashboard nav link is clicked, while
// the target route's code/data streams in - covers every page under
// (dashboard) (vendor/*, super-admin/*, profile) since this sits above all
// of them. Shape is a rough approximation (title + stats + list) rather
// than matching any one page exactly, on purpose - it just needs to read
// as "the app responded", not to be pixel-perfect.
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <StatGridSkeleton count={4} />
      <CardListSkeleton count={4} />
    </div>
  );
}
