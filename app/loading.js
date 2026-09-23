// Immediate route-level fallback for the first document load. Data-bearing
// screens still fetch live after this paints; this only removes the blank
// interval while the route bundle and server response arrive.
export default function Loading() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:px-8 sm:py-8" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="h-6 w-40 rounded-sm bg-slate-200/80 animate-shimmer" />
          <div className="h-9 w-28 rounded-sm bg-slate-200/80 animate-shimmer" />
        </div>
        <div className="h-28 w-full rounded-sm bg-slate-200/80 animate-shimmer" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-sm bg-slate-200/80 animate-shimmer" />
          ))}
        </div>
        <div className="h-48 w-full rounded-sm bg-slate-200/80 animate-shimmer" />
      </div>
    </main>
  );
}
