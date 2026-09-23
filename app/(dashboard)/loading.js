// Shown the instant a dashboard nav link is clicked, while the target/
// route's code/data streams in, covers every page under (dashboard)
// (vendor/*, super-admin/*, profile) since this sits above all of them.
export default function Loading() {
  return (
    <div className="font-ui min-h-screen flex" aria-busy="true" aria-label="Loading">
      <div className="hidden w-60 shrink-0 bg-brand-900 sm:block" />
      <main className="flex-1 space-y-6 bg-canvas p-4 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="h-6 w-40 rounded-sm bg-slate-200/80 animate-shimmer" />
          <div className="h-9 w-28 rounded-sm bg-slate-200/80 animate-shimmer" />
        </div>
        <div className="h-40 w-full rounded-sm bg-slate-200/80 animate-shimmer" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-sm bg-slate-200/80 animate-shimmer" />
          ))}
        </div>
        <div className="h-48 w-full rounded-sm bg-slate-200/80 animate-shimmer" />
      </main>
    </div>
  );
}
