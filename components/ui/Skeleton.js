export function Skeleton({ className = "" }) {
  return <div className={`animate-shimmer bg-slate-200/80 rounded-sm ${className}`} />;
}

export function EventCardSkeleton() {
  return (
    <div className="flex flex-row-reverse bg-white rounded-sm overflow-hidden shadow-sm border border-slate-100">
      <Skeleton className="w-28 sm:w-44 md:w-56 h-28 sm:h-36 shrink-0 rounded-none" />
      <div className="p-3 sm:p-5 flex-1 space-y-2.5">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3.5 w-1/4" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-3 flex items-start gap-3">
      <Skeleton className="w-8 h-8 rounded-sm shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

// A 2-column grid of StatCardSkeletons, matching the stat-card grids used
// across the dashboards (see components/ui/StatCard.js).
export function StatGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableRowSkeleton({ cols = 4, rows = 3 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-slate-100">
          {Array.from({ length: cols }, (_, i) => (
            <td key={i} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// For pages that render a vertical stack of cards (assignments, KG
// reports, per-class roster cards) rather than a table.
export function CardListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-sm p-4 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between border border-slate-100 rounded-sm p-3 gap-3">
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-1/4" />
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}

export function DashboardEventCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-2/5" />
      </div>
    </div>
  );
}

// A handful of label+input rows, for pages whose real content is a form
// (create/edit event, profile) so the page doesn't jump from a generic
// spinner into a form-shaped layout.
export function FormSkeleton({ fields = 4 }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

// Matches the (auth) route group's card: PublicNav/Footer already persist
// via app/(auth)/layout.js, this is just the form card in between.
export function AuthCardSkeleton({ fields = 2 }) {
  return (
    <div className="space-y-5">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

// Matches app/(dashboard)/vendor/dashboard/page.js's shape once a store
// exists: title row, the store-link card, the 4-stat grid, and the quick
// actions grid - shown while useVendorStore is still resolving, so the
// page doesn't jump from a near-empty skeleton into a much taller real
// layout once stores load.
export function VendorDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="space-y-2 max-w-md bg-slate-50 border border-slate-200 rounded-sm p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
        <div className="flex items-start gap-2 pt-1">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-28 shrink-0" />
        </div>
      </div>

      <StatGridSkeleton count={4} />

      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 rounded-sm p-4">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Matches app/e/[slug]/checkout: header bar, step badges, a couple of
// ticket-type rows on the left, an order-summary card on the right.
export function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-6 w-full mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-sm shadow-sm p-6 space-y-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-start justify-between gap-4 pt-4 border-t border-slate-100 first:border-t-0 first:pt-0">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3.5 w-1/5" />
                </div>
                <Skeleton className="h-9 w-20 shrink-0" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-sm shadow-sm p-6 space-y-3 h-fit">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}

// The banner + title + meta-row shape shared by the public event page and
// checkout, so both the client-side "still fetching" state and the
// route-level loading.js can use the same skeleton instead of a spinner.
export function EventDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton className="rounded-sm aspect-square w-full" />
      <div className="space-y-5">
        <Skeleton className="h-8 w-4/5" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-5 w-4/5" />
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-12 w-full sm:w-48" />
      </div>
    </div>
  );
}
