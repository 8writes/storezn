// Mirrors the till layout (register bar + product grid + current-sale
// panel) so the page doesn't jump around once it loads.
export function PosSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-surface border border-slate-200 rounded-sm px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="h-4 w-28 bg-slate-200 rounded-sm" />
        <div className="h-4 w-20 bg-slate-100 rounded-sm" />
        <div className="h-4 w-24 bg-slate-100 rounded-sm" />
        <div className="h-4 w-16 bg-slate-100 rounded-sm" />
        <div className="ml-auto flex gap-1.5">
          <div className="h-6 w-14 bg-slate-100 rounded-sm" />
          <div className="h-6 w-16 bg-slate-100 rounded-sm" />
          <div className="h-6 w-14 bg-slate-100 rounded-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <div className="h-11 w-full bg-slate-100 rounded-sm" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
                <div className="aspect-square bg-slate-100" />
                <div className="p-2 space-y-1.5">
                  <div className="h-3 w-full bg-slate-100 rounded-sm" />
                  <div className="h-3.5 w-12 bg-slate-200 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <div className="h-3.5 w-24 bg-slate-100 rounded-sm" />
              <div className="h-3.5 w-16 bg-slate-100 rounded-sm" />
            </div>
            <div className="px-4 py-10 flex justify-center">
              <div className="h-3.5 w-40 bg-slate-100 rounded-sm" />
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-between">
              <div className="h-4 w-12 bg-slate-100 rounded-sm" />
              <div className="h-4 w-16 bg-slate-200 rounded-sm" />
            </div>
          </div>
          <div className="bg-surface border border-slate-200 rounded-sm p-3 space-y-2">
            <div className="h-9 w-full bg-slate-100 rounded-sm" />
            <div className="h-9 w-full bg-slate-100 rounded-sm" />
          </div>
          <div className="h-12 w-full bg-slate-200 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
